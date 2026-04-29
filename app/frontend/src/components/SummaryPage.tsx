import { useMemo, useState, type KeyboardEvent } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Clock, Layers, FileText, ArrowLeft, RotateCcw, RefreshCw, MessageSquare, Loader2, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useModels } from '@/hooks/useModels';
import { useRunStore } from '@/store/runStore';
import type { RunStatus, Phase } from '@/types';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface SummaryPageProps {
  runId: string | null;
  runStatus: RunStatus;
  prompt: string;
  phases: Record<string, Phase>;
  planOutput: string;
  scriptContent: string;
  mainOutput: string;
  onBackToRun: () => void;
  onNewRun: () => void;
  onRerun?: () => void;
  onRegenerate?: () => void;
  onFollowUpSent?: () => void;
  className?: string;
}

// ---------------------------------------------------------------------------
// Status config
// ---------------------------------------------------------------------------
const STATUS_CONFIG: Record<string, {
  icon: typeof CheckCircle2;
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  badgeBg: string;
}> = {
  completed: {
    icon: CheckCircle2,
    label: 'Completed Successfully',
    color: 'text-[#2D6A2D]',
    bgColor: 'bg-[#f0f7f0]',
    borderColor: 'border-[#2D6A2D]/30',
    badgeBg: 'bg-[#2D6A2D]/10',
  },
  failed: {
    icon: XCircle,
    label: 'Execution Failed',
    color: 'text-[#B71C1C]',
    bgColor: 'bg-[#fdf0f0]',
    borderColor: 'border-[#B71C1C]/30',
    badgeBg: 'bg-[#B71C1C]/10',
  },
  stopped: {
    icon: AlertTriangle,
    label: 'Execution Stopped',
    color: 'text-[#8B6914]',
    bgColor: 'bg-[#FFFBF0]',
    borderColor: 'border-[#8B6914]/30',
    badgeBg: 'bg-[#8B6914]/10',
  },
  error: {
    icon: XCircle,
    label: 'Error Occurred',
    color: 'text-[#B71C1C]',
    bgColor: 'bg-[#fdf0f0]',
    borderColor: 'border-[#B71C1C]/30',
    badgeBg: 'bg-[#B71C1C]/10',
  },
};

const PHASE_STATUS_CONFIG: Record<Phase['status'], {
  icon: string;
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
}> = {
  completed: { icon: '✅', label: 'Completed', color: 'text-[#2D6A2D]', bgColor: 'bg-[#f0f7f0]', borderColor: 'border-[#2D6A2D]/20' },
  failed:    { icon: '❌', label: 'Failed',    color: 'text-[#B71C1C]', bgColor: 'bg-[#fdf0f0]', borderColor: 'border-[#B71C1C]/20' },
  skipped:   { icon: '⏭️', label: 'Skipped',   color: 'text-[#A08570]', bgColor: 'bg-[#F9F6F1]', borderColor: 'border-[#A08570]/20' },
  running:   { icon: '⏳', label: 'Running',   color: 'text-[#8B6914]', bgColor: 'bg-[#FFFBF0]', borderColor: 'border-[#8B6914]/20' },
};

// ---------------------------------------------------------------------------
// Stat Card
// ---------------------------------------------------------------------------
interface StatCardProps {
  icon: typeof Clock;
  label: string;
  value: string | number;
  subValue?: string;
  color?: string;
}

function StatCard({ icon: Icon, label, value, subValue, color = 'text-[#5C1A1A]' }: StatCardProps) {
  return (
    <div className="flex items-center gap-3 bg-white border border-[#D4C5B0] rounded-lg px-4 py-3">
      <div className={cn('p-2 rounded-lg bg-[#F9F6F1]', color)}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-[11px] text-[#A08570] font-medium uppercase tracking-wider">{label}</p>
        <p className="text-lg font-bold text-[#2C1810]">{value}</p>
        {subValue && <p className="text-[11px] text-[#7A5C4A]">{subValue}</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phase Summary Card
// ---------------------------------------------------------------------------
interface PhaseSummaryCardProps {
  phaseId: string;
  phase: Phase;
}

function PhaseSummaryCard({ phaseId, phase }: PhaseSummaryCardProps) {
  const cfg = PHASE_STATUS_CONFIG[phase.status];

  return (
    <div className={cn(
      'bg-white border rounded-lg overflow-hidden transition-all',
      cfg.borderColor,
    )}>
      {/* Phase header */}
      <div className={cn('flex items-center justify-between px-4 py-3 border-b', cfg.bgColor, cfg.borderColor)}>
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-base">{cfg.icon}</span>
          <span className="text-sm font-semibold text-[#2C1810] truncate">
            {phase.label || phaseId}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {phase.model && (
            <span className="text-[10px] font-mono text-[#7A5C4A] bg-[#F3EDE3] border border-[#D4C5B0] px-1.5 py-0.5 rounded">
              {phase.model}
            </span>
          )}
          <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded', cfg.color, cfg.bgColor)}>
            {cfg.label}
          </span>
        </div>
      </div>

      {/* Phase summary */}
      {phase.summary && (
        <div className="px-4 py-3">
          <div className="text-xs text-[#4A3728] leading-relaxed">
            <MarkdownRenderer content={phase.summary} />
          </div>
        </div>
      )}

      {/* No summary fallback */}
      {!phase.summary && phase.status !== 'skipped' && (
        <div className="px-4 py-3">
          <p className="text-xs text-[#A08570] italic">No summary available for this phase.</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Summary Page
// ---------------------------------------------------------------------------
export function SummaryPage({
  runId,
  runStatus,
  prompt,
  phases,
  planOutput,
  scriptContent,
  mainOutput,
  onBackToRun,
  onNewRun,
  onRerun,
  onRegenerate,
  onFollowUpSent,
  className,
}: SummaryPageProps) {
  const statusCfg = STATUS_CONFIG[runStatus] || STATUS_CONFIG.error;
  const StatusIcon = statusCfg.icon;

  const generateModel = useRunStore((s) => s.generateModel);
  const { groupedModels, loading: modelsLoading, error: modelsError } = useModels();
  const providerNames = Object.keys(groupedModels);

  const [followUpText, setFollowUpText] = useState('');
  const [followUpSending, setFollowUpSending] = useState(false);
  const [followUpError, setFollowUpError] = useState<string | null>(null);
  const [followUpModel, setFollowUpModel] = useState<string>(generateModel);

  async function handleSendFollowUp() {
    if (!runId || !followUpText.trim() || followUpSending) return;

    setFollowUpSending(true);
    setFollowUpError(null);
    try {
      const res = await fetch(`/api/runs/${runId}/follow-up`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: followUpText.trim(),
          model: followUpModel,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed (${res.status})`);
      }
      setFollowUpText('');
      onFollowUpSent?.();
      onBackToRun();
    } catch (err) {
      setFollowUpError(err instanceof Error ? err.message : 'Failed to send follow-up');
    } finally {
      setFollowUpSending(false);
    }
  }

  function handleFollowUpKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSendFollowUp();
    }
  }

  // Compute stats
  const stats = useMemo(() => {
    const phaseEntries = Object.entries(phases);
    const total = phaseEntries.length;
    const completed = phaseEntries.filter(([, p]) => p.status === 'completed').length;
    const failed = phaseEntries.filter(([, p]) => p.status === 'failed').length;
    const skipped = phaseEntries.filter(([, p]) => p.status === 'skipped').length;

    // Estimate output size
    const totalOutputChars = mainOutput.length;
    const outputSize = totalOutputChars > 1000000
      ? `${(totalOutputChars / 1000000).toFixed(1)}M chars`
      : totalOutputChars > 1000
        ? `${(totalOutputChars / 1000).toFixed(1)}K chars`
        : `${totalOutputChars} chars`;

    return { total, completed, failed, skipped, outputSize };
  }, [phases, mainOutput]);

  const phaseEntries = Object.entries(phases);

  // Sort phases: failed first, then completed, then skipped
  const sortedPhases = useMemo(() => {
    const statusOrder: Record<string, number> = { failed: 0, running: 1, completed: 2, skipped: 3 };
    return [...phaseEntries].sort(([, a], [, b]) => {
      return (statusOrder[a.status] ?? 4) - (statusOrder[b.status] ?? 4);
    });
  }, [phaseEntries]);

  const canRerun = runStatus === 'failed' || runStatus === 'stopped' || runStatus === 'error';

  return (
    <ScrollArea className={cn('flex-1 bg-[#F9F6F1]', className)}>
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {/* ── Status Banner ── */}
        <div className={cn(
          'flex items-center gap-4 p-5 rounded-xl border-2',
          statusCfg.bgColor,
          statusCfg.borderColor,
        )}>
          <div className={cn('p-3 rounded-full', statusCfg.badgeBg)}>
            <StatusIcon className={cn('h-8 w-8', statusCfg.color)} />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className={cn('text-xl font-bold', statusCfg.color)}>
              {statusCfg.label}
            </h1>
            <p className="text-sm text-[#7A5C4A] mt-0.5 truncate">
              {prompt || 'No task description'}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={onBackToRun}
              className="gap-1.5"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              View Logs
            </Button>
            {canRerun && onRegenerate && (
              <Button
                variant="outline"
                size="sm"
                onClick={onRegenerate}
                className="gap-1.5"
                title="Generate a brand-new script from the same plan, then review it before execution"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Regenerate
              </Button>
            )}
            {canRerun && onRerun && (
              <Button
                variant="default"
                size="sm"
                onClick={onRerun}
                className="gap-1.5"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Re-run
              </Button>
            )}
          </div>
        </div>

        {/* ── Stats Grid ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            icon={Layers}
            label="Total Phases"
            value={stats.total}
            subValue={stats.total === 0 ? 'No phases detected' : undefined}
          />
          <StatCard
            icon={CheckCircle2}
            label="Completed"
            value={stats.completed}
            color="text-[#2D6A2D]"
            subValue={stats.total > 0 ? `${Math.round((stats.completed / stats.total) * 100)}%` : undefined}
          />
          <StatCard
            icon={XCircle}
            label="Failed"
            value={stats.failed}
            color={stats.failed > 0 ? 'text-[#B71C1C]' : 'text-[#A08570]'}
          />
          <StatCard
            icon={FileText}
            label="Output"
            value={stats.outputSize}
            color="text-[#7A5C4A]"
          />
        </div>

        {/* ── Phase Results ── */}
        {sortedPhases.length > 0 && (
          <div>
            <h2 className="text-sm font-bold text-[#2C1810] uppercase tracking-wider mb-3 flex items-center gap-2">
              <Layers className="h-4 w-4 text-[#5C1A1A]" />
              Phase Results
            </h2>
            <div className="space-y-3">
              {sortedPhases.map(([phaseId, phase]) => (
                <PhaseSummaryCard key={phaseId} phaseId={phaseId} phase={phase} />
              ))}
            </div>
          </div>
        )}

        {/* ── Plan Summary ── */}
        {planOutput && (
          <div>
            <h2 className="text-sm font-bold text-[#2C1810] uppercase tracking-wider mb-3 flex items-center gap-2">
              <FileText className="h-4 w-4 text-[#5C1A1A]" />
              Plan
            </h2>
            <div className="bg-white border border-[#D4C5B0] rounded-lg p-4">
              <div className="text-xs text-[#4A3728] leading-relaxed max-h-[300px] overflow-y-auto">
                <MarkdownRenderer content={planOutput} />
              </div>
            </div>
          </div>
        )}

        {/* ── Send Additional Instructions ── */}
        <div>
          <h2 className="text-sm font-bold text-[#2C1810] uppercase tracking-wider mb-3 flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-[#6B2D6B]" />
            Send Additional Instructions
          </h2>
          <div className="bg-white border border-[#D4C5B0] rounded-lg p-4 space-y-3">
            <p className="text-xs text-[#7A5C4A] leading-relaxed">
              Send a one-shot follow-up to the agent. The original task, final
              status, and per-phase outcomes are included automatically as context.
            </p>
            <Textarea
              value={followUpText}
              onChange={(e) => setFollowUpText(e.target.value)}
              onKeyDown={handleFollowUpKeyDown}
              disabled={followUpSending || !runId}
              placeholder="e.g. Now update the README to reflect the new module layout, and add a brief note about the migration step that failed."
              className="min-h-[100px]"
            />

            <div className="flex flex-col gap-1">
              <span className="text-[11px] font-medium text-[#7A5C4A] uppercase tracking-wider">
                Model
              </span>
              <Select
                value={followUpModel}
                onValueChange={setFollowUpModel}
                disabled={modelsLoading || followUpSending}
              >
                <SelectTrigger className="w-full sm:w-[280px]">
                  {modelsLoading ? (
                    <span className="text-[#A08570] flex items-center gap-1.5">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Loading…
                    </span>
                  ) : (
                    <SelectValue placeholder="Select model" />
                  )}
                </SelectTrigger>
                <SelectContent>
                  {providerNames.map((provider) => (
                    <SelectGroup key={provider}>
                      <SelectLabel>{provider}</SelectLabel>
                      {groupedModels[provider].map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                  {providerNames.length === 0 && !modelsLoading && (
                    <div className="px-2 py-3 text-xs text-[#A08570] text-center">
                      No models available
                    </div>
                  )}
                </SelectContent>
              </Select>
              {modelsError && (
                <p className="text-[11px] text-[#B71C1C] flex items-center gap-1">
                  <span>⚠</span> Could not load models: {modelsError}
                </p>
              )}
            </div>

            {followUpError && (
              <p className="text-xs text-[#B71C1C]">{followUpError}</p>
            )}
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] text-[#A08570]">
                ⌘/Ctrl + Enter to send. You'll be returned to the Output view to watch the response.
              </p>
              <Button
                size="sm"
                variant="purple"
                onClick={handleSendFollowUp}
                disabled={followUpSending || !runId || !followUpText.trim()}
                className="gap-1.5 shrink-0"
              >
                {followUpSending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                Send Follow-up
              </Button>
            </div>
          </div>
        </div>

        {/* ── Actions Footer ── */}
        <div className="flex items-center justify-between pt-4 border-t border-[#D4C5B0]">
          <p className="text-xs text-[#A08570]">
            Run complete • {stats.total} phases processed
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onBackToRun}
            >
              View Full Logs
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={onNewRun}
            >
              Start New Run
            </Button>
          </div>
        </div>
      </div>
    </ScrollArea>
  );
}
