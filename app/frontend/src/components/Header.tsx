import { useNavigate } from 'react-router-dom';
import { Layers, Square, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRunStore } from '@/store/runStore';
import type { RunStatus } from '@/types';

const STATUS_CONFIG: Record<
  RunStatus,
  { label: string; color: string; textColor: string; pulse: boolean }
> = {
  planning:       { label: 'Planning',       color: 'bg-[#8B6914]',  textColor: 'text-[#8B6914]',  pulse: true  },
  'plan-review':  { label: 'Plan Review',    color: 'bg-[#6B2D6B]',  textColor: 'text-[#6B2D6B]',  pulse: false },
  generating:     { label: 'Generating',     color: 'bg-[#8B4513]',  textColor: 'text-[#8B4513]',  pulse: true  },
  'script-review':{ label: 'Script Review',  color: 'bg-[#1A5C5C]',  textColor: 'text-[#1A5C5C]',  pulse: false },
  running:        { label: 'Running',        color: 'bg-[#5C1A1A]',  textColor: 'text-[#5C1A1A]',  pulse: true  },
  chatting:     { label: 'Chatting',    color: 'bg-[#5C1A1A]',  textColor: 'text-[#5C1A1A]',  pulse: true  },
  completed:    { label: 'Completed',   color: 'bg-[#2D6A2D]',  textColor: 'text-[#2D6A2D]',  pulse: false },
  failed:       { label: 'Failed',      color: 'bg-[#B71C1C]',  textColor: 'text-[#B71C1C]',  pulse: false },
  stopped:      { label: 'Stopped',     color: 'bg-[#A08570]',  textColor: 'text-[#A08570]',  pulse: false },
  error:        { label: 'Error',       color: 'bg-[#B71C1C]',  textColor: 'text-[#B71C1C]',  pulse: false },
};

const STOPPABLE_STATUSES: RunStatus[] = [
  'planning',
  'generating',
  'running',
  'chatting',
];

export function Header() {
  const navigate = useNavigate();
  const view = useRunStore((s) => s.view);
  const runId = useRunStore((s) => s.runId);
  const runStatus = useRunStore((s) => s.runStatus);
  const resetRun = useRunStore((s) => s.resetRun);

  const statusCfg = runStatus ? STATUS_CONFIG[runStatus] : null;
  const canStop = runStatus !== null && STOPPABLE_STATUSES.includes(runStatus);

  async function handleStop() {
    if (!runId) return;
    try {
      await fetch(`/api/runs/${runId}/stop`, { method: 'POST' });
    } catch {
      // status event will update the UI
    }
  }

  function handleNewRun() {
    resetRun();
    navigate('/');
  }

  return (
    <header className="flex items-center justify-between h-12 px-5 border-b border-[#D4C5B0] bg-white shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2.5">
        <div className="flex items-center justify-center h-7 w-7 rounded-md bg-[#5C1A1A]">
          <Layers className="h-4 w-4 text-[#F9F6F1]" />
        </div>
        <span className="text-sm font-semibold text-[#2C1810] tracking-tight">
          Qodo Agent Team
        </span>
      </div>

      {/* Status + Run ID */}
      {view === 'run' && (
        <div className="flex items-center gap-3">
          {statusCfg && (
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-[#F3EDE3] border border-[#D4C5B0]">
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${statusCfg.color} ${
                  statusCfg.pulse ? 'animate-pulse' : ''
                }`}
              />
              <span className={`text-xs font-medium ${statusCfg.textColor}`}>
                {statusCfg.label}
              </span>
            </div>
          )}
          {runId && (
            <span className="text-xs font-mono text-[#A08570] hidden sm:block">
              {runId}
            </span>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2">
        {view === 'run' && canStop && (
          <Button
            variant="destructive"
            size="sm"
            onClick={handleStop}
            className="gap-1"
          >
            <Square className="h-3 w-3" />
            Stop
          </Button>
        )}
        {view === 'run' && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleNewRun}
            className="gap-1"
          >
            <Plus className="h-3 w-3" />
            New Run
          </Button>
        )}
      </div>
    </header>
  );
}
