import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Terminal } from '@/components/Terminal';
import type { Phase } from '@/types';

interface ParallelViewProps {
  phases: Record<string, Phase>;
  className?: string;
}

type PhaseStatus = Phase['status'];

const STATUS_DOT: Record<PhaseStatus, { color: string; pulse: boolean; label: string; badge: string }> = {
  running:   { color: 'bg-[#8B6914]',  pulse: true,  label: 'Running',   badge: 'text-[#8B6914] bg-[rgba(139,105,20,0.1)] border-[rgba(139,105,20,0.25)]' },
  completed: { color: 'bg-[#2D6A2D]',  pulse: false, label: 'Done',      badge: 'text-[#2D6A2D] bg-[rgba(45,106,45,0.1)]  border-[rgba(45,106,45,0.25)]'  },
  failed:    { color: 'bg-[#B71C1C]',  pulse: false, label: 'Failed',    badge: 'text-[#B71C1C] bg-[rgba(183,28,28,0.1)]  border-[rgba(183,28,28,0.25)]'  },
  skipped:   { color: 'bg-[#A08570]',  pulse: false, label: 'Skipped',   badge: 'text-[#A08570] bg-[rgba(160,133,112,0.1)] border-[rgba(160,133,112,0.25)]' },
};

interface PhasePaneProps {
  phaseId: string;
  phase: Phase;
}

function PhasePane({ phaseId, phase }: PhasePaneProps) {
  const dotCfg = STATUS_DOT[phase.status];

  return (
    <div className="flex flex-col bg-white border border-[#D4C5B0] rounded-lg overflow-hidden min-h-[300px] shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 bg-[#F9F6F1] border-b border-[#D4C5B0] shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={cn(
              'inline-block h-2 w-2 rounded-full shrink-0',
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

  return (
    <div
      className={cn('p-4 overflow-y-auto flex-1 bg-[#F9F6F1]', className)}
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
        gap: '1rem',
        alignContent: 'start',
      }}
    >
      {phaseEntries.map(([phaseId, phase]) => (
        <PhasePane key={phaseId} phaseId={phaseId} phase={phase} />
      ))}
    </div>
  );
}
