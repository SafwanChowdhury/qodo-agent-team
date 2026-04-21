import { Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RunStatus } from '@/types';

type StepState = 'pending' | 'active' | 'done' | 'error';

interface Step {
  id: string;
  label: string;
}

interface StepperProps {
  runStatus: RunStatus | null;
  className?: string;
}

const STEPS: Step[] = [
  { id: 'plan', label: 'Plan' },
  { id: 'review', label: 'Review' },
  { id: 'generate', label: 'Generate' },
  { id: 'script-review', label: 'Script Review' },
  { id: 'execute', label: 'Execute' },
];

function deriveStepStates(status: RunStatus | null): Record<string, StepState> {
  if (!status) {
    return { plan: 'pending', review: 'pending', generate: 'pending', 'script-review': 'pending', execute: 'pending' };
  }

  switch (status) {
    case 'planning':
      return { plan: 'active', review: 'pending', generate: 'pending', 'script-review': 'pending', execute: 'pending' };
    case 'plan-review':
      return { plan: 'done', review: 'active', generate: 'pending', 'script-review': 'pending', execute: 'pending' };
    case 'generating':
      return { plan: 'done', review: 'done', generate: 'active', 'script-review': 'pending', execute: 'pending' };
    case 'script-review':
      return { plan: 'done', review: 'done', generate: 'done', 'script-review': 'active', execute: 'pending' };
    case 'running':
    case 'chatting':
      return { plan: 'done', review: 'done', generate: 'done', 'script-review': 'done', execute: 'active' };
    case 'completed':
      return { plan: 'done', review: 'done', generate: 'done', 'script-review': 'done', execute: 'done' };
    case 'failed':
    case 'error':
    case 'stopped':
      return { plan: 'done', review: 'done', generate: 'done', 'script-review': 'done', execute: 'error' };
    default:
      return { plan: 'pending', review: 'pending', generate: 'pending', 'script-review': 'pending', execute: 'pending' };
  }
}

interface StepCircleProps {
  index: number;
  state: StepState;
}

function StepCircle({ index, state }: StepCircleProps) {
  const base =
    'flex items-center justify-center w-7 h-7 rounded-full border-2 text-xs font-bold shrink-0 transition-all duration-300';

  if (state === 'done') {
    return (
      <div className={cn(base, 'border-[#2D6A2D] bg-[rgba(45,106,45,0.1)] text-[#2D6A2D]')}>
        <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className={cn(base, 'border-[#B71C1C] bg-[rgba(183,28,28,0.1)] text-[#B71C1C]')}>
        <X className="h-3.5 w-3.5" strokeWidth={2.5} />
      </div>
    );
  }

  if (state === 'active') {
    return (
      <div className={cn(base, 'border-[#5C1A1A] bg-[#5C1A1A] text-[#F9F6F1] animate-pulse')}>
        {index + 1}
      </div>
    );
  }

  return (
    <div className={cn(base, 'border-[#D4C5B0] bg-[#F3EDE3] text-[#A08570]')}>
      {index + 1}
    </div>
  );
}

interface ConnectorProps {
  leftState: StepState;
}

function Connector({ leftState }: ConnectorProps) {
  const filled = leftState === 'done';
  const error = leftState === 'error';
  return (
    <div
      className={cn(
        'flex-1 h-px mx-2 transition-all duration-300',
        filled ? 'bg-[#2D6A2D]' : error ? 'bg-[#B71C1C]' : 'bg-[#D4C5B0]'
      )}
    />
  );
}

export function Stepper({ runStatus, className }: StepperProps) {
  const stepStates = deriveStepStates(runStatus);

  return (
    <div
      className={cn(
        'flex items-center px-6 py-3 bg-white border-b border-[#D4C5B0]',
        className
      )}
    >
      {STEPS.map((step, index) => {
        const state = stepStates[step.id] as StepState;
        const isLast = index === STEPS.length - 1;

        return (
          <div key={step.id} className="flex items-center flex-1 min-w-0">
            <div className="flex flex-col items-center gap-1 shrink-0">
              <StepCircle index={index} state={state} />
              <span
                className={cn(
                  'text-[11px] font-medium whitespace-nowrap transition-colors duration-300',
                  state === 'active' && 'text-[#5C1A1A]',
                  state === 'done' && 'text-[#2D6A2D]',
                  state === 'error' && 'text-[#B71C1C]',
                  state === 'pending' && 'text-[#A08570]'
                )}
              >
                {step.label}
              </span>
            </div>

            {!isLast && (
              <div className="flex-1 flex items-center px-1 pb-4">
                <Connector leftState={state} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
