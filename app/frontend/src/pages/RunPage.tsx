import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { socket, emitApproveScript, emitRejectScript } from '@/lib/socket';
import { useRunStore } from '@/store/runStore';
import { Stepper } from '@/components/Stepper';
import { Terminal } from '@/components/Terminal';
import { ParallelView } from '@/components/ParallelView';
import { ScriptVisualizer } from '@/components/ScriptVisualizer';
import { RespondBar, type RespondMode } from '@/components/RespondBar';
import { PlanTab } from '@/components/PlanTab';
import type { RunStatus, Phase } from '@/types';

type BuiltinTabId = 'main' | 'plan' | 'script' | 'parallel';
type TabId = BuiltinTabId | string;

interface TabDef {
  id: TabId;
  label: string;
  phaseStatus?: Phase['status'];
}

function deriveRespondMode(status: RunStatus | null): RespondMode {
  if (!status) return 'none';
  switch (status) {
    case 'running':   return 'respond';
    case 'chatting':
    case 'completed': return 'chat';
    case 'planning':
    case 'generating': return 'waiting';
    case 'script-review': return 'none';
    default:          return 'none';
  }
}

const PHASE_DOT: Record<Phase['status'], string> = {
  running:   'bg-[#8B6914] animate-pulse',
  completed: 'bg-[#2D6A2D]',
  failed:    'bg-[#B71C1C]',
  skipped:   'bg-[#A08570]',
};

interface TabBarProps {
  tabs: TabDef[];
  activeTab: string;
  onTabChange: (id: string) => void;
}

function TabBar({ tabs, activeTab, onTabChange }: TabBarProps) {
  return (
    <div className="flex items-center gap-0 px-2 bg-white border-b border-[#D4C5B0] overflow-x-auto shrink-0">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={cn(
            'flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium whitespace-nowrap',
            'border-b-2 transition-colors duration-150 focus:outline-none',
            activeTab === tab.id
              ? 'border-[#5C1A1A] text-[#5C1A1A]'
              : 'border-transparent text-[#7A5C4A] hover:text-[#2C1810] hover:bg-[#F9F3EC]'
          )}
        >
          {tab.phaseStatus && (
            <span
              className={cn(
                'inline-block h-1.5 w-1.5 rounded-full shrink-0',
                PHASE_DOT[tab.phaseStatus]
              )}
            />
          )}
          {tab.label}
        </button>
      ))}
    </div>
  );
}

interface PromptBarProps {
  prompt: string;
}

function PromptBar({ prompt }: PromptBarProps) {
  const [collapsed, setCollapsed] = useState(true);

  if (!prompt) return null;

  return (
    <div className="bg-[#F9F6F1] border-b border-[#D4C5B0] shrink-0">
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="flex items-center justify-between w-full px-4 py-2 text-left hover:bg-[#F3EDE3] transition-colors"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-[10px] font-bold text-[#5C1A1A] uppercase tracking-widest shrink-0 bg-[#EDE5D8] px-2 py-0.5 rounded">
            Task
          </span>
          {collapsed && (
            <span className="text-xs text-[#7A5C4A] truncate">{prompt}</span>
          )}
        </div>
        {collapsed ? (
          <ChevronDown className="h-3.5 w-3.5 text-[#A08570] shrink-0" />
        ) : (
          <ChevronUp className="h-3.5 w-3.5 text-[#A08570] shrink-0" />
        )}
      </button>

      {!collapsed && (
        <div className="px-4 pb-3">
          <p className="text-sm text-[#2C1810] whitespace-pre-wrap leading-relaxed">
            {prompt}
          </p>
        </div>
      )}
    </div>
  );
}

export default function RunPage() {
  const { runId: routeRunId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const notFoundTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runId = useRunStore((s) => s.runId);
  const runStatus = useRunStore((s) => s.runStatus);
  const prompt = useRunStore((s) => s.prompt);
  const mainOutput = useRunStore((s) => s.mainOutput);
  const planOutput = useRunStore((s) => s.planOutput);
  const planStreaming = useRunStore((s) => s.planStreaming);
  const planConversation = useRunStore((s) => s.planConversation);
  const scriptContent = useRunStore((s) => s.scriptContent);
  const phases = useRunStore((s) => s.phases);
  const activeTab = useRunStore((s) => s.activeTab);
  const setActiveTab = useRunStore((s) => s.setActiveTab);
  const setRunId = useRunStore((s) => s.setRunId);
  const setView = useRunStore((s) => s.setView);

  useEffect(() => {
    if (!routeRunId) return;

    if (!runId) {
      setRunId(routeRunId);
      setView('run');
    }

    socket.emit('run:join', routeRunId);

    notFoundTimerRef.current = setTimeout(() => {
      if (!useRunStore.getState().runStatus) {
        navigate('/');
      }
    }, 8000);

    return () => {
      if (notFoundTimerRef.current) {
        clearTimeout(notFoundTimerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeRunId]);

  useEffect(() => {
    if (runStatus && notFoundTimerRef.current) {
      clearTimeout(notFoundTimerRef.current);
      notFoundTimerRef.current = null;
    }
  }, [runStatus]);

  const isScriptReview = runStatus === 'script-review';

  const handleApproveScript = useCallback(() => {
    if (routeRunId || runId) {
      emitApproveScript((routeRunId || runId)!);
    }
  }, [routeRunId, runId]);

  const handleRejectScript = useCallback(
    (feedback: string) => {
      if (routeRunId || runId) {
        emitRejectScript((routeRunId || runId)!, feedback);
      }
    },
    [routeRunId, runId]
  );

  // Build execution phase status map for the visualizer
  const executionPhaseStatus = Object.entries(phases).reduce(
    (acc, [phaseId, phase]) => {
      acc[phaseId] = { status: phase.status };
      return acc;
    },
    {} as Record<string, { status: 'running' | 'completed' | 'failed' | 'skipped' }>
  );

  const tabs: TabDef[] = [{ id: 'main', label: 'Output' }];

  const hasPlan = Boolean(planOutput || planStreaming);
  if (hasPlan) tabs.push({ id: 'plan', label: 'Plan' });
  if (scriptContent) tabs.push({ id: 'script', label: isScriptReview ? '⚡ Script Review' : 'Script' });

  const phaseEntries = Object.entries(phases);
  if (phaseEntries.length > 0) {
    tabs.push({ id: 'parallel', label: 'All Phases' });
    phaseEntries.forEach(([phaseId, phase]) => {
      tabs.push({
        id: phaseId,
        label: phase.label || phaseId,
        phaseStatus: phase.status,
      });
    });
  }

  const validTabIds = new Set(tabs.map((t) => t.id));
  const currentTab = validTabIds.has(activeTab) ? activeTab : 'main';

  const respondMode = deriveRespondMode(runStatus);

  function renderTabContent() {
    switch (currentTab) {
      case 'main':
        return <Terminal content={mainOutput} className="flex-1" />;

      case 'plan':
        return (
          <div className="flex-1 overflow-hidden">
            <PlanTab />
          </div>
        );

      case 'script':
        return (
          <ScriptVisualizer
            content={scriptContent}
            isReview={isScriptReview}
            runId={routeRunId ?? runId}
            onApprove={handleApproveScript}
            onReject={handleRejectScript}
            executionPhases={
              runStatus === 'running' || runStatus === 'completed' || runStatus === 'failed'
                ? executionPhaseStatus
                : undefined
            }
            className="flex-1"
          />
        );

      case 'parallel':
        return <ParallelView phases={phases} className="flex-1" />;

      default: {
        const phase = phases[currentTab];
        if (!phase) {
          return (
            <div className="flex items-center justify-center flex-1 text-[#A08570] text-sm bg-[#F9F6F1]">
              Phase not found
            </div>
          );
        }
        return <Terminal content={phase.output} className="flex-1" />;
      }
    }
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden bg-[#F9F6F1]">
      <PromptBar prompt={prompt} />
      <Stepper runStatus={runStatus} />
      <TabBar tabs={tabs} activeTab={currentTab} onTabChange={setActiveTab} />

      <div className="flex flex-col flex-1 overflow-hidden">
        {renderTabContent()}
      </div>

      <RespondBar mode={respondMode} runId={routeRunId ?? runId} />
    </div>
  );
}
