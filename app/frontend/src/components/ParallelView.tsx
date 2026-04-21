import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Terminal } from '@/components/Terminal';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';
import type { Phase } from '@/types';

interface ParallelViewProps {
  phases: Record<string, Phase>;
  className?: string;
}

type PhaseStatus = Phase['status'];

const STATUS_DOT: Record<PhaseStatus, { color: string; pulse: boolean; label: string; badge: string; icon: string }> = {
  running:   { color: 'bg-[#8B6914]',  pulse: true,  label: 'Running',   badge: 'text-[#8B6914] bg-[rgba(139,105,20,0.1)] border-[rgba(139,105,20,0.25)]',  icon: '⏳' },
  completed: { color: 'bg-[#2D6A2D]',  pulse: false, label: 'Done',      badge: 'text-[#2D6A2D] bg-[rgba(45,106,45,0.1)]  border-[rgba(45,106,45,0.25)]',   icon: '✅' },
  failed:    { color: 'bg-[#B71C1C]',  pulse: false, label: 'Failed',    badge: 'text-[#B71C1C] bg-[rgba(183,28,28,0.1)]  border-[rgba(183,28,28,0.25)]',   icon: '❌' },
  skipped:   { color: 'bg-[#A08570]',  pulse: false, label: 'Skipped',   badge: 'text-[#A08570] bg-[rgba(160,133,112,0.1)] border-[rgba(160,133,112,0.25)]', icon: '⏭️' },
};

// ---------------------------------------------------------------------------
// Detect the current activity stage from raw agent output
// ---------------------------------------------------------------------------
function detectStage(output: string): { stage: string; detail: string } {
  if (!output || output.length < 10) return { stage: 'Initializing', detail: 'Waiting for agent output…' };

  // Strip ANSI for analysis
  // eslint-disable-next-line no-control-regex
  const clean = output.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
                      .replace(/\x1b\][^\x07]*\x07/g, '')
                      .replace(/\x1b\[[\?]?[0-9;]*[a-zA-Z]/g, '');

  // Check the last ~2000 chars for the most recent activity
  const tail = clean.substring(Math.max(0, clean.length - 2000));

  // Look for tool call patterns (most recent first)
  // Tool calls look like: +- tool_name
  const toolCalls = [...tail.matchAll(/\+[-─]\s+\[?\d*m?\]?(\w+)/g)];
  const lastTool = toolCalls.length > 0 ? toolCalls[toolCalls.length - 1][1] : null;

  // Check if the last tool call has a result
  const lastToolResultIdx = Math.max(tail.lastIndexOf('[OK]'), tail.lastIndexOf('[ERR]'));
  const lastToolCallIdx = tail.lastIndexOf('+- ');
  const toolInProgress = lastToolCallIdx > lastToolResultIdx;

  if (toolInProgress && lastTool) {
    const toolLabels: Record<string, string> = {
      read_files: 'Reading files',
      read_file: 'Reading file',
      edit_file: 'Editing file',
      write_file: 'Writing file',
      ripgrep_search: 'Searching codebase',
      shell_execute: 'Running command',
      thinking: 'Thinking',
      create_todo_list: 'Planning tasks',
    };
    const label = toolLabels[lastTool] || `Running ${lastTool}`;
    return { stage: 'Working', detail: label };
  }

  // Count completed tool calls
  const okCount = (tail.match(/\[OK\]/g) || []).length;
  const errCount = (tail.match(/\[ERR\]/g) || []).length;
  const totalTools = okCount + errCount;

  if (totalTools > 0 && !toolInProgress) {
    // All tool calls done — agent is likely writing summary
    return { stage: 'Finishing', detail: `${totalTools} tool calls completed` };
  }

  // Check for initialization patterns
  if (tail.includes('Initializing Qodo Agent') || tail.includes('Initializing MCP')) {
    return { stage: 'Initializing', detail: 'Starting agent…' };
  }

  if (tail.includes('Welcome to Qodo')) {
    return { stage: 'Ready', detail: 'Agent initialized, processing task…' };
  }

  return { stage: 'Working', detail: 'Processing…' };
}

// ---------------------------------------------------------------------------
// PhasePane — individual phase card
// ---------------------------------------------------------------------------
interface PhasePaneProps {
  phaseId: string;
  phase: Phase;
}

function PhasePane({ phaseId, phase }: PhasePaneProps) {
  const dotCfg = STATUS_DOT[phase.status];
  const [showSummary, setShowSummary] = useState(true);

  // Detect current stage from output
  const stageInfo = useMemo(() => {
    if (phase.status === 'completed' || phase.status === 'failed' || phase.status === 'skipped') {
      return null; // Don't show stage for terminal states
    }
    return detectStage(phase.output);
  }, [phase.output, phase.status]);

  const hasSummary = phase.status !== 'running' && phase.summary;

  return (
    <div className={cn(
      'flex flex-col bg-white border rounded-lg overflow-hidden min-h-[300px] shadow-sm transition-colors duration-300',
      phase.status === 'completed' && 'border-[#2D6A2D]/30',
      phase.status === 'failed' && 'border-[#B71C1C]/30',
      phase.status === 'skipped' && 'border-[#A08570]/30',
      phase.status === 'running' && 'border-[#D4C5B0]',
    )}>
      {/* Header */}
      <div className={cn(
        'flex items-center justify-between px-3 py-2.5 border-b shrink-0 transition-colors duration-300',
        phase.status === 'completed' && 'bg-[#f0f7f0] border-[#2D6A2D]/20',
        phase.status === 'failed' && 'bg-[#fdf0f0] border-[#B71C1C]/20',
        phase.status === 'skipped' && 'bg-[#F9F6F1] border-[#A08570]/20',
        phase.status === 'running' && 'bg-[#F9F6F1] border-[#D4C5B0]',
      )}>
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={cn(
              'inline-block h-2.5 w-2.5 rounded-full shrink-0',
              dotCfg.color,
              dotCfg.pulse && 'animate-pulse'
            )}
            title={dotCfg.label}
          />
          <span className="text-xs font-semibold text-[#2C1810] truncate">
            {phase.label || phaseId}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-2">
          {phase.model && (
            <span className="text-[10px] font-mono text-[#7A5C4A] bg-[#F3EDE3] border border-[#D4C5B0] px-1.5 py-0.5 rounded">
              {phase.model}
            </span>
          )}
          <span
            className={cn(
              'text-[10px] font-medium px-1.5 py-0.5 rounded border',
              dotCfg.badge
            )}
          >
            {dotCfg.label}
          </span>
        </div>
      </div>

      {/* Stage indicator ��� only shown while running */}
      {stageInfo && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-[#FFFBF0] border-b border-[#E8DFD0] text-[11px]">
          <span className="text-[#8B6914] font-medium">{stageInfo.stage}</span>
          <span className="text-[#A08570]">—</span>
          <span className="text-[#7A5C4A] truncate">{stageInfo.detail}</span>
        </div>
      )}

      {/* Summary — shown when phase is done and has a summary */}
      {hasSummary && (
        <div className={cn(
          'border-b',
          phase.status === 'completed' ? 'bg-[#f5faf5] border-[#2D6A2D]/15' : 'bg-[#fdf5f5] border-[#B71C1C]/15]',
        )}>
          <button
            onClick={() => setShowSummary(!showSummary)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] font-medium text-[#2C1810] hover:bg-black/[0.02] transition-colors"
          >
            <span>{showSummary ? '▾' : '▸'}</span>
            <span>Agent Summary</span>
          </button>
          {showSummary && (
            <div className="px-3 pb-2 text-xs text-[#4A3728] leading-relaxed max-h-[200px] overflow-y-auto">
              <MarkdownRenderer content={phase.summary!} />
            </div>
          )}
        </div>
      )}

      {/* Terminal output */}
      <ScrollArea className="flex-1 h-[260px]">
        <Terminal
          content={phase.output}
          className="min-h-[260px] h-full"
        />
      </ScrollArea>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ParallelView — grid of all phase panes
// ---------------------------------------------------------------------------
export function ParallelView({ phases, className }: ParallelViewProps) {
  const phaseEntries = Object.entries(phases);

  if (phaseEntries.length === 0) {
    return (
      <div
        className={cn(
          'flex items-center justify-center flex-1 text-[#A08570] text-sm',
          className
        )}
      >
        No phases yet…
      </div>
    );
  }

  // Count stats
  const stats = phaseEntries.reduce(
    (acc, [, p]) => {
      acc[p.status] = (acc[p.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div className={cn('flex flex-col flex-1 bg-[#F9F6F1] overflow-hidden', className)}>
      {/* Summary bar */}
      <div className="flex items-center gap-4 px-4 py-2 bg-[#F3EDE3] border-b border-[#D4C5B0] shrink-0">
        <span className="text-xs font-semibold text-[#2C1810]">
          Phases: {phaseEntries.length}
        </span>
        {stats.running > 0 && (
          <span className="text-[10px] text-[#8B6914] font-medium">
            ⏳ {stats.running} running
          </span>
        )}
        {stats.completed > 0 && (
          <span className="text-[10px] text-[#2D6A2D] font-medium">
            ✅ {stats.completed} done
          </span>
        )}
        {stats.failed > 0 && (
          <span className="text-[10px] text-[#B71C1C] font-medium">
            ❌ {stats.failed} failed
          </span>
        )}
        {stats.skipped > 0 && (
          <span className="text-[10px] text-[#A08570] font-medium">
            ⏭️ {stats.skipped} skipped
          </span>
        )}
      </div>

      {/* Phase grid */}
      <div
        className="p-4 overflow-y-auto flex-1"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
          gap: '1rem',
          alignContent: 'start',
        }}
      >
        {phaseEntries.map(([phaseId, phase]) => (
          <PhasePane key={phaseId} phaseId={phaseId} phase={phase} />
        ))}
      </div>
    </div>
  );
}
