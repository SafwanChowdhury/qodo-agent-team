import { useState, useMemo } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Play,
  Layers,
  FileText,
  Cpu,
  GitBranch,
  Shield,
  BookOpen,
  Code2,
  Eye,
  EyeOff,
  CheckCircle,
  MessageSquare,
  Send,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScriptPreview } from '@/components/ScriptPreview';
import type { ParsedPhase, ParsedBrief, ParsedConfig } from '@/types';

// ---------------------------------------------------------------------------
// Script parser — extracts structured info from the generated bash script
// ---------------------------------------------------------------------------

interface ParsedScriptData {
  config: ParsedConfig;
  brief: ParsedBrief;
  phases: ParsedPhase[];
  preflightChecks: string[];
  rawScript: string;
}

function parseScript(raw: string): ParsedScriptData {
  const config: ParsedConfig = {
    projectPath: '',
    logDir: '',
    opusModel: '',
    sonnetModel: '',
  };

  // Extract config
  const projMatch = raw.match(/^PROJ="([^"]+)"/m);
  if (projMatch) config.projectPath = projMatch[1];

  const logMatch = raw.match(/^LOG=([^\n]+)/m);
  if (logMatch) config.logDir = logMatch[1].replace(/"/g, '');

  const opusMatch = raw.match(/OPUS="([^"]+)"/m);
  if (opusMatch) config.opusModel = opusMatch[1];
  else {
    const opusMatch2 = raw.match(/OPUS="qodo[^"]*--model=([^\s"]+)/m);
    if (opusMatch2) config.opusModel = opusMatch2[1];
  }

  const sonnetMatch = raw.match(/SONNET="([^"]+)"/m);
  if (sonnetMatch) config.sonnetModel = sonnetMatch[1];
  else {
    const sonnetMatch2 = raw.match(/SONNET="qodo[^"]*--model=([^\s"]+)/m);
    if (sonnetMatch2) config.sonnetModel = sonnetMatch2[1];
  }

  // Extract brief
  const brief: ParsedBrief = { title: '', content: '' };
  const briefMatch = raw.match(/cat\s*>\s*"\$BRIEF"\s*<<\s*'?BRIEF_EOF'?\n([\s\S]*?)\nBRIEF_EOF/);
  if (briefMatch) {
    brief.content = briefMatch[1].trim();
    const titleMatch = brief.content.match(/^#\s+(.+)/m);
    if (titleMatch) brief.title = titleMatch[1];
  }

  // Extract preflight checks
  const preflightChecks: string[] = [];
  const preflightSection = raw.match(/log "Checking prerequisites\.\.\."\n([\s\S]*?)(?=\nmkdir -p)/);
  if (preflightSection) {
    const checks = preflightSection[1].matchAll(/command -v (\S+)/g);
    for (const check of checks) {
      preflightChecks.push(check[1]);
    }
    const dirChecks = preflightSection[1].matchAll(/\[\[ -[df] "([^"]+)" \]\]/g);
    for (const check of dirChecks) {
      preflightChecks.push(`path: ${check[1]}`);
    }
  }

  // Extract phases
  const phases: ParsedPhase[] = [];

  // Find all phase execution blocks from log headers and section comments
  const phaseRegex = /(?:log\s+"═+"\s*\n\s*log\s+"PHASE\s+(\d+|N)\s*\[([^\]]+)\]:\s*([^"]+)"|# =+\n# PHASE\s+(\d+|N)\s*[—–-]\s*(\w+):\s*([^\n]+))/g;
  let phaseMatch;
  const phaseHeaders: Array<{ number: string; model: string; label: string; index: number }> = [];

  while ((phaseMatch = phaseRegex.exec(raw)) !== null) {
    const number = phaseMatch[1] || phaseMatch[4] || '?';
    const model = phaseMatch[2] || phaseMatch[5] || 'Unknown';
    const label = (phaseMatch[3] || phaseMatch[6] || 'Unknown').trim().replace(/"$/, '');
    phaseHeaders.push({ number, model, label, index: phaseMatch.index });
  }

  // Also try to find phases from run_phase or launch_bg calls
  const runPhaseRegex = /(?:run_phase|launch_bg)\s+"([^"]+)"\s+"([^"]+)"\s+\\\n\s*\$(\w+)\s+--dir="[^"]*"\s+\\\n\s*"([\s\S]*?)(?:"\s*$|"\s*\n)/gm;
  let rpMatch;
  const phasePrompts = new Map<string, { prompt: string; logFile: string; modelVar: string }>();

  while ((rpMatch = runPhaseRegex.exec(raw)) !== null) {
    const label = rpMatch[1];
    const logFile = rpMatch[2];
    const modelVar = rpMatch[3];
    const prompt = rpMatch[4];
    phasePrompts.set(label, { prompt, logFile, modelVar });
  }

  // More flexible prompt extraction - find the full prompt strings passed to qodo
  const qodoCallRegex = /(?:run_phase|launch_bg)\s+"([^"]+)"\s+"([^"]+)"\s+\\\s*\n\s*\$(\w+)\s+--dir="[^"]*"\s+\\\s*\n\s*"((?:[^"\\]|\\.|"(?!\s*$|\s*\n))*?)"/gms;
  let qcMatch;
  while ((qcMatch = qodoCallRegex.exec(raw)) !== null) {
    const label = qcMatch[1];
    const logFile = qcMatch[2];
    const modelVar = qcMatch[3];
    const prompt = qcMatch[4].replace(/\\"/g, '"').replace(/\\\$/g, '$');
    if (!phasePrompts.has(label)) {
      phasePrompts.set(label, { prompt, logFile, modelVar });
    }
  }

  // Detect parallel groups
  const parallelSections = raw.matchAll(/log "═+"\s*\n\s*log "PHASES?\s+([\d+]+(?:\+\d+)*):\s*([^"]*?)"/g);
  const parallelGroups = new Map<string, string>();
  for (const ps of parallelSections) {
    const phaseNums = ps[1].split('+');
    const groupLabel = ps[2].trim();
    for (const num of phaseNums) {
      parallelGroups.set(num, groupLabel);
    }
  }

  // Also detect launch_bg usage to identify parallel phases
  const launchBgPhases = new Set<string>();
  const launchBgRegex = /launch_bg\s+"Phase\s+(\d+)/g;
  let lbMatch;
  while ((lbMatch = launchBgRegex.exec(raw)) !== null) {
    launchBgPhases.add(lbMatch[1]);
  }

  // Extract skip check functions
  const skipChecks = new Map<string, string>();
  const skipRegex = /phase(\d+|N)_done\(\)\s*\{([\s\S]*?)\n\}/g;
  let skipMatch;
  while ((skipMatch = skipRegex.exec(raw)) !== null) {
    skipChecks.set(skipMatch[1], skipMatch[2].trim());
  }

  // Extract checkpoint calls
  const checkpoints = new Map<string, string>();
  const checkpointRegex = /checkpoint\s+"([^"]+)"/g;
  let cpMatch;
  while ((cpMatch = checkpointRegex.exec(raw)) !== null) {
    // Associate with the nearest preceding phase
    const cpIndex = cpMatch.index;
    let nearestPhase = '';
    for (const ph of phaseHeaders) {
      if (ph.index < cpIndex) nearestPhase = ph.number;
    }
    if (nearestPhase) checkpoints.set(nearestPhase, cpMatch[1]);
  }

  // Extract file lists from prompts
  function extractFiles(prompt: string): string[] {
    const filesMatch = prompt.match(/FILES:.*?\n((?:\s+\S+\n?)+)/);
    if (filesMatch) {
      return filesMatch[1]
        .split('\n')
        .map((f) => f.trim())
        .filter(Boolean);
    }
    return [];
  }

  // Build phase objects
  for (const header of phaseHeaders) {
    const phaseLabel = `Phase ${header.number}: ${header.label}`;
    const promptData = phasePrompts.get(phaseLabel) || phasePrompts.get(`Phase ${header.number}: ${header.label.trim()}`);

    // Try to find the raw block for this phase
    const phaseStart = header.index;
    const nextPhaseIdx = phaseHeaders.find((h) => h.index > phaseStart)?.index;
    const rawBlock = nextPhaseIdx
      ? raw.substring(phaseStart, nextPhaseIdx)
      : raw.substring(phaseStart, Math.min(phaseStart + 2000, raw.length));

    const isParallel = launchBgPhases.has(header.number) || parallelGroups.has(header.number);

    const prompt = promptData?.prompt || '';
    const files = extractFiles(prompt);

    phases.push({
      id: `phase-${header.number}`,
      number: header.number,
      label: header.label,
      model: header.model,
      modelVar: promptData?.modelVar || (header.model.toLowerCase().includes('opus') ? 'OPUS' : 'SONNET'),
      isParallel,
      parallelGroup: parallelGroups.get(header.number),
      skipCheck: skipChecks.get(header.number),
      prompt,
      files: files.length > 0 ? files : undefined,
      hasCheckpoint: checkpoints.has(header.number),
      checkpointLabel: checkpoints.get(header.number),
      rawBlock,
    });
  }

  // If no phases were found via headers, try a simpler approach
  if (phases.length === 0) {
    // Try to find phases from if blocks with run_phase/launch_bg
    const simplePhaseRegex = /if\s+\[\[\s+\$P(\d+)\s+-eq\s+0\s+\]\];\s*then\s*\n\s*(?:run_phase|launch_bg)\s+"([^"]+)"/g;
    let spMatch;
    while ((spMatch = simplePhaseRegex.exec(raw)) !== null) {
      const num = spMatch[1];
      const label = spMatch[2].replace(/^Phase\s+\d+:\s*/, '');
      const isParallel = launchBgPhases.has(num);

      phases.push({
        id: `phase-${num}`,
        number: num,
        label,
        model: 'Unknown',
        modelVar: 'SONNET',
        isParallel,
        parallelGroup: parallelGroups.get(num),
        skipCheck: skipChecks.get(num),
        prompt: '',
        hasCheckpoint: checkpoints.has(num),
        checkpointLabel: checkpoints.get(num),
        rawBlock: '',
      });
    }
  }

  return {
    config,
    brief,
    phases,
    preflightChecks,
    rawScript: raw,
  };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface CollapsibleSectionProps {
  title: string;
  icon: React.ReactNode;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
  className?: string;
}

function CollapsibleSection({
  title,
  icon,
  badge,
  defaultOpen = false,
  children,
  className,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={cn('border border-[#D4C5B0] rounded-lg overflow-hidden bg-white', className)}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2.5 w-full px-4 py-3 text-left hover:bg-[#F9F3EC] transition-colors"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 text-[#7A5C4A] shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-[#7A5C4A] shrink-0" />
        )}
        <span className="shrink-0 text-[#5C1A1A]">{icon}</span>
        <span className="text-sm font-semibold text-[#2C1810] flex-1">{title}</span>
        {badge}
      </button>
      {open && <div className="border-t border-[#EDE5D8]">{children}</div>}
    </div>
  );
}

interface PhaseCardProps {
  phase: ParsedPhase;
  config: ParsedConfig;
  isExecuting?: boolean;
  executionStatus?: 'running' | 'completed' | 'failed' | 'skipped';
}

function PhaseCard({ phase, config, isExecuting, executionStatus }: PhaseCardProps) {
  const [showPrompt, setShowPrompt] = useState(false);

  const modelLabel = phase.model;
  const isOpus = modelLabel.toLowerCase().includes('opus');

  // Build the full prompt that will be sent to the agent
  const fullPrompt = useMemo(() => {
    if (!phase.prompt) return 'Prompt not available for this phase.';

    // The prompt typically includes $(cat "$BRIEF") which gets the brief content
    let prompt = phase.prompt;
    // Clean up bash variable references for display
    prompt = prompt.replace(/\$\(cat "\$BRIEF"\)\s*\n?/, '[SHARED BRIEF - see Brief section above]\n\n');
    prompt = prompt.replace(/\$PROJ/g, config.projectPath || '$PROJ');
    return prompt;
  }, [phase.prompt, config.projectPath]);

  return (
    <div
      className={cn(
        'border rounded-lg overflow-hidden transition-all',
        phase.isParallel
          ? 'border-[#6B2D6B]/30 bg-[#6B2D6B]/[0.02]'
          : 'border-[#D4C5B0] bg-white',
        isExecuting && executionStatus === 'running' && 'ring-2 ring-[#8B6914]/50',
        executionStatus === 'completed' && 'border-[#2D6A2D]/40',
        executionStatus === 'failed' && 'border-[#B71C1C]/40'
      )}
    >
      {/* Phase header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-[#F9F6F1] border-b border-[#EDE5D8]">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {/* Status indicator */}
          {isExecuting ? (
            <span
              className={cn(
                'inline-block h-2.5 w-2.5 rounded-full shrink-0',
                executionStatus === 'running' && 'bg-[#8B6914] animate-pulse',
                executionStatus === 'completed' && 'bg-[#2D6A2D]',
                executionStatus === 'failed' && 'bg-[#B71C1C]',
                executionStatus === 'skipped' && 'bg-[#A08570]',
                !executionStatus && 'bg-[#D4C5B0]'
              )}
            />
          ) : (
            <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-[#5C1A1A] text-[#F9F6F1] text-[10px] font-bold shrink-0">
              {phase.number}
            </span>
          )}

          <span className="text-sm font-semibold text-[#2C1810] truncate">
            {phase.label}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {phase.isParallel && (
            <Badge variant="purple" className="text-[10px] gap-1">
              <GitBranch className="h-3 w-3" />
              Parallel
            </Badge>
          )}
          <Badge
            variant={isOpus ? 'warning' : 'secondary'}
            className="text-[10px] font-mono"
          >
            {modelLabel}
          </Badge>
          {phase.hasCheckpoint && (
            <Badge variant="outline" className="text-[10px] gap-1">
              <Shield className="h-3 w-3" />
              Checkpoint
            </Badge>
          )}
        </div>
      </div>

      {/* Phase details */}
      <div className="px-4 py-3 space-y-2.5">
        {/* Files */}
        {phase.files && phase.files.length > 0 && (
          <div className="flex items-start gap-2">
            <FileText className="h-3.5 w-3.5 text-[#7A5C4A] mt-0.5 shrink-0" />
            <div className="flex flex-wrap gap-1">
              {phase.files.map((file, i) => (
                <span
                  key={i}
                  className="text-[10px] font-mono bg-[#F3EDE3] text-[#5C1A1A] px-1.5 py-0.5 rounded border border-[#D4C5B0]"
                >
                  {file}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Skip check */}
        {phase.skipCheck && (
          <div className="flex items-start gap-2">
            <Shield className="h-3.5 w-3.5 text-[#7A5C4A] mt-0.5 shrink-0" />
            <span className="text-xs text-[#7A5C4A]">
              <span className="font-medium">Skip check:</span>{' '}
              <code className="text-[10px] font-mono bg-[#F3EDE3] px-1 py-0.5 rounded">
                {phase.skipCheck.length > 120
                  ? phase.skipCheck.substring(0, 120) + '…'
                  : phase.skipCheck}
              </code>
            </span>
          </div>
        )}

        {/* Checkpoint */}
        {phase.hasCheckpoint && phase.checkpointLabel && (
          <div className="flex items-start gap-2 bg-[#8B6914]/5 px-2.5 py-2 rounded border border-[#8B6914]/20">
            <AlertTriangle className="h-3.5 w-3.5 text-[#8B6914] mt-0.5 shrink-0" />
            <span className="text-xs text-[#8B6914] font-medium">
              Checkpoint: {phase.checkpointLabel}
            </span>
          </div>
        )}

        {/* View prompt button */}
        <button
          onClick={() => setShowPrompt(!showPrompt)}
          className="flex items-center gap-1.5 text-xs text-[#5C1A1A] hover:text-[#7A2828] font-medium transition-colors"
        >
          {showPrompt ? (
            <EyeOff className="h-3.5 w-3.5" />
          ) : (
            <Eye className="h-3.5 w-3.5" />
          )}
          {showPrompt ? 'Hide Agent Prompt' : 'View Agent Prompt'}
        </button>

        {/* Full prompt */}
        {showPrompt && (
          <div className="bg-[#1C0808] rounded-lg border border-[#3A1515] overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 bg-[#2A0E0E] border-b border-[#3A1515]">
              <Cpu className="h-3 w-3 text-[#9ca3af]" />
              <span className="text-[10px] font-mono text-[#9ca3af]">
                Full prompt for Phase {phase.number} agent
              </span>
            </div>
            <pre className="p-3 font-mono text-[11px] leading-relaxed text-[#F0E6E0] overflow-x-auto whitespace-pre-wrap max-h-[400px] overflow-y-auto">
              {fullPrompt}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main ScriptVisualizer component
// ---------------------------------------------------------------------------

interface ScriptVisualizerProps {
  content: string;
  isReview?: boolean;
  runId?: string | null;
  onApprove?: () => void;
  onReject?: (feedback: string) => void;
  onRegenerate?: () => void;
  executionPhases?: Record<string, { status: 'running' | 'completed' | 'failed' | 'skipped' }>;
  className?: string;
}

export function ScriptVisualizer({
  content,
  isReview = false,
  runId,
  onApprove,
  onReject,
  onRegenerate,
  executionPhases,
  className,
}: ScriptVisualizerProps) {
  const [showRawScript, setShowRawScript] = useState(false);
  const [rejectMode, setRejectMode] = useState(false);
  const [feedback, setFeedback] = useState('');

  const parsed = useMemo(() => parseScript(content), [content]);

  // Group parallel phases
  const phaseGroups = useMemo(() => {
    const groups: Array<{ type: 'sequential' | 'parallel'; phases: ParsedPhase[]; label?: string }> = [];
    let currentParallelGroup: ParsedPhase[] = [];
    let currentParallelLabel = '';

    for (const phase of parsed.phases) {
      if (phase.isParallel) {
        if (currentParallelGroup.length === 0) {
          currentParallelLabel = phase.parallelGroup || 'Parallel Group';
        }
        currentParallelGroup.push(phase);
      } else {
        if (currentParallelGroup.length > 0) {
          groups.push({ type: 'parallel', phases: [...currentParallelGroup], label: currentParallelLabel });
          currentParallelGroup = [];
        }
        groups.push({ type: 'sequential', phases: [phase] });
      }
    }
    if (currentParallelGroup.length > 0) {
      groups.push({ type: 'parallel', phases: currentParallelGroup, label: currentParallelLabel });
    }

    return groups;
  }, [parsed.phases]);

  function handleReject() {
    if (!feedback.trim() || !onReject) return;
    onReject(feedback.trim());
    setFeedback('');
    setRejectMode(false);
  }

  if (!content) {
    return (
      <div className={cn('flex items-center justify-center flex-1 text-[#A08570] text-sm', className)}>
        No script content available.
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col h-full overflow-hidden', className)}>
      {/* Header with raw toggle */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-[#D4C5B0] shrink-0">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-[#5C1A1A]" />
          <span className="text-sm font-semibold text-[#2C1810]">
            {isReview ? 'Script Review' : 'Script Overview'}
          </span>
          {parsed.phases.length > 0 && (
            <Badge variant="secondary" className="text-[10px]">
              {parsed.phases.length} phase{parsed.phases.length !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>

        <button
          onClick={() => setShowRawScript(!showRawScript)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
            showRawScript
              ? 'bg-[#5C1A1A] text-[#F9F6F1]'
              : 'bg-[#F3EDE3] text-[#7A5C4A] hover:bg-[#EDE5D8] border border-[#D4C5B0]'
          )}
        >
          <Code2 className="h-3.5 w-3.5" />
          {showRawScript ? 'Visual View' : 'Raw Script'}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {showRawScript ? (
          <div className="p-4 bg-[#F9F6F1]">
            <ScriptPreview content={content} className="h-full" />
          </div>
        ) : (
          <div className="p-4 space-y-4 bg-[#F9F6F1]">
            {/* Config section */}
            {(parsed.config.projectPath || parsed.config.opusModel) && (
              <CollapsibleSection
                title="Configuration"
                icon={<Cpu className="h-4 w-4" />}
                badge={
                  <Badge variant="secondary" className="text-[10px]">
                    {parsed.config.opusModel ? '2 models' : '1 model'}
                  </Badge>
                }
              >
                <div className="px-4 py-3 space-y-2">
                  {parsed.config.projectPath && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[#7A5C4A] font-medium w-20 shrink-0">Project:</span>
                      <code className="text-xs font-mono text-[#5C1A1A] bg-[#F3EDE3] px-2 py-0.5 rounded">
                        {parsed.config.projectPath}
                      </code>
                    </div>
                  )}
                  {parsed.config.logDir && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[#7A5C4A] font-medium w-20 shrink-0">Logs:</span>
                      <code className="text-xs font-mono text-[#5C1A1A] bg-[#F3EDE3] px-2 py-0.5 rounded">
                        {parsed.config.logDir}
                      </code>
                    </div>
                  )}
                  {parsed.config.opusModel && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[#7A5C4A] font-medium w-20 shrink-0">Opus:</span>
                      <code className="text-xs font-mono text-[#8B6914] bg-[#8B6914]/5 px-2 py-0.5 rounded border border-[#8B6914]/20">
                        {parsed.config.opusModel}
                      </code>
                    </div>
                  )}
                  {parsed.config.sonnetModel && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[#7A5C4A] font-medium w-20 shrink-0">Sonnet:</span>
                      <code className="text-xs font-mono text-[#7A5C4A] bg-[#F3EDE3] px-2 py-0.5 rounded border border-[#D4C5B0]">
                        {parsed.config.sonnetModel}
                      </code>
                    </div>
                  )}
                </div>
              </CollapsibleSection>
            )}

            {/* Preflight checks */}
            {parsed.preflightChecks.length > 0 && (
              <CollapsibleSection
                title="Preflight Checks"
                icon={<Shield className="h-4 w-4" />}
                badge={
                  <Badge variant="secondary" className="text-[10px]">
                    {parsed.preflightChecks.length} check{parsed.preflightChecks.length !== 1 ? 's' : ''}
                  </Badge>
                }
              >
                <div className="px-4 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    {parsed.preflightChecks.map((check, i) => (
                      <span
                        key={i}
                        className="text-[10px] font-mono bg-[#F3EDE3] text-[#2C1810] px-2 py-1 rounded border border-[#D4C5B0]"
                      >
                        {check}
                      </span>
                    ))}
                  </div>
                </div>
              </CollapsibleSection>
            )}

            {/* Brief */}
            {parsed.brief.content && (
              <CollapsibleSection
                title={parsed.brief.title || 'Shared Brief'}
                icon={<BookOpen className="h-4 w-4" />}
                badge={<Badge variant="secondary" className="text-[10px]">Context for all agents</Badge>}
              >
                <div className="px-4 py-3">
                  <pre className="text-xs text-[#2C1810] whitespace-pre-wrap leading-relaxed font-sans">
                    {parsed.brief.content}
                  </pre>
                </div>
              </CollapsibleSection>
            )}

            {/* Execution Pipeline */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                <Play className="h-4 w-4 text-[#5C1A1A]" />
                <span className="text-sm font-semibold text-[#2C1810]">Execution Pipeline</span>
              </div>

              {/* Phase timeline */}
              <div className="space-y-3">
                {phaseGroups.map((group, groupIdx) => {
                  if (group.type === 'parallel') {
                    return (
                      <div key={groupIdx} className="space-y-2">
                        {/* Parallel group header */}
                        <div className="flex items-center gap-2 px-3">
                          <div className="h-px flex-1 bg-[#6B2D6B]/30" />
                          <span className="text-[10px] font-semibold text-[#6B2D6B] uppercase tracking-wider flex items-center gap-1.5">
                            <GitBranch className="h-3 w-3" />
                            Parallel Execution
                          </span>
                          <div className="h-px flex-1 bg-[#6B2D6B]/30" />
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 pl-4 border-l-2 border-[#6B2D6B]/30 ml-3">
                          {group.phases.map((phase) => (
                            <PhaseCard
                              key={phase.id}
                              phase={phase}
                              config={parsed.config}
                              isExecuting={!!executionPhases}
                              executionStatus={
                                executionPhases?.[`phase${phase.number}`]?.status
                              }
                            />
                          ))}
                        </div>

                        <div className="flex items-center gap-2 px-3">
                          <div className="h-px flex-1 bg-[#6B2D6B]/30" />
                          <span className="text-[10px] text-[#6B2D6B]/60 uppercase tracking-wider">
                            End Parallel
                          </span>
                          <div className="h-px flex-1 bg-[#6B2D6B]/30" />
                        </div>
                      </div>
                    );
                  }

                  return group.phases.map((phase) => (
                    <PhaseCard
                      key={phase.id}
                      phase={phase}
                      config={parsed.config}
                      isExecuting={!!executionPhases}
                      executionStatus={
                        executionPhases?.[`phase${phase.number}`]?.status
                      }
                    />
                  ));
                })}

                {parsed.phases.length === 0 && (
                  <div className="text-center py-8 text-[#A08570] text-sm">
                    <p>Could not parse individual phases from the script.</p>
                    <p className="text-xs mt-1">Use the "Raw Script" toggle to view the full script.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Review action bar */}
      {isReview && (
        <div className="shrink-0 border-t border-[#D4C5B0] bg-white">
          {rejectMode && (
            <div className="px-4 pt-3 pb-2 flex items-center gap-2 border-b border-[#EDE5D8]">
              <Input
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleReject();
                  }
                  if (e.key === 'Escape') {
                    setRejectMode(false);
                    setFeedback('');
                  }
                }}
                placeholder="Describe what changes you want to the script…"
                className="flex-1 text-sm"
                autoFocus
              />
              <Button
                size="sm"
                onClick={handleReject}
                disabled={!feedback.trim()}
                className="gap-1.5 shrink-0"
              >
                <Send className="h-3.5 w-3.5" />
                Send
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setRejectMode(false);
                  setFeedback('');
                }}
                className="shrink-0 text-[#A08570] hover:text-[#2C1810]"
              >
                Cancel
              </Button>
            </div>
          )}

          <div className="flex items-center justify-between px-4 py-3 gap-3">
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setRejectMode(!rejectMode)}
                className="gap-1.5"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                Request Changes
              </Button>
              {onRegenerate && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onRegenerate}
                  className="gap-1.5"
                  title="Regenerate the script with the same plan (use this if the script came back truncated or broken)"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Regenerate
                </Button>
              )}
            </div>

            <Button
              size="sm"
              variant="success"
              onClick={onApprove}
              className="gap-1.5 font-medium"
            >
              <CheckCircle className="h-3.5 w-3.5" />
              Approve &amp; Execute
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
