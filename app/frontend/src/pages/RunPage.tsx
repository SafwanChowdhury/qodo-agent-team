import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronUp, RotateCcw, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { socket, emitApproveScript, emitRejectScript, emitRerunScript } from '@/lib/socket';
import { useRunStore } from '@/store/runStore';
import { Stepper } from '@/components/Stepper';
import { Terminal } from '@/components/Terminal';
import { ParallelView } from '@/components/ParallelView';
import { ScriptVisualizer } from '@/components/ScriptVisualizer';
import { RespondBar, type RespondMode } from '@/components/RespondBar';
import { PlanTab } from '@/components/PlanTab';
import { SummaryPage } from '@/components/SummaryPage';
import { Button } from '@/components/ui/button';
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

// ---------------------------------------------------------------------------
// FailedRunBar — shown when execution fails/stops, allows re-running run.sh
// ---------------------------------------------------------------------------
interface FailedRunBarProps {
  status: RunStatus;
  scriptPath: string;
  onRerun: () => void;
}

function FailedRunBar({ status, scriptPath, onRerun }: FailedRunBarProps) {
  const statusLabel =
    status === 'failed' ? 'failed' : status === 'stopped' ? 'was stopped' : 'encountered an error';

  const bgColor =
    status === 'failed'
      ? 'bg-[#B71C1C]/5 border-[#B71C1C]/30'
      : status === 'stopped'
      ? 'bg-[#8B6914]/5 border-[#8B6914]/30'
      : 'bg-[#B71C1C]/5 border-[#B71C1C]/30';

  const iconColor =
    status === 'failed' ? 'text-[#B71C1C]' : status === 'stopped' ? 'text-[#8B6914]' : 'text-[#B71C1C]';

  return (
    <div className={cn('shrink-0 border-t px-4 py-3', bgColor)}>
      <div className="flex items-center gap-3">
        <AlertTriangle className={cn('h-4 w-4 shrink-0', iconColor)} />

        <div className="flex-1 min-w-0">
          <p className="text-sm text-[#2C1810]">
            Script execution {statusLabel}.
          </p>
          <p className="text-xs text-[#7A5C4A] mt-0.5">
            You can edit <code className="font-mono text-[10px] bg-[#F3EDE3] px-1 py-0.5 rounded">{scriptPath}</code> on
            disk and re-run, or re-run as-is to retry (skip checks will resume from where it left off).
          </p>
        </div>

        <Button
          size="sm"
          variant="default"
          onClick={onRerun}
          className="gap-1.5 shrink-0"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Re-run Script
        </Button>
      </div>
    </div>
  );
}

export default function RunPage() {
  const { runId: routeRunId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const notFoundTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track whether to show the summary view
  const [showSummary, setShowSummary] = useState(false);
  // Track the previous status to detect transitions to terminal states
  const prevStatusRef = useRef<RunStatus | null>(null);

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

  // Auto-show summary when execution transitions to a terminal state
  const TERMINAL_STATUSES: RunStatus[] = ['completed', 'failed', 'stopped', 'error'];
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = runStatus;

    if (
      runStatus &&
      TERMINAL_STATUSES.includes(runStatus) &&
      prev !== null &&
      !TERMINAL_STATUSES.includes(prev)
    ) {
      // Small delay to let final phase data flush in
      const timer = setTimeout(() => setShowSummary(true), 1500);
      return () => clearTimeout(timer);
    }

    // If the run restarts (e.g. re-run), hide the summary
    if (runStatus && !TERMINAL_STATUSES.includes(runStatus)) {
      setShowSummary(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const handleRerunScript = useCallback(() => {
    if (routeRunId || runId) {
      emitRerunScript((routeRunId || runId)!);
    }
  }, [routeRunId, runId]);

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

  const canRerun = scriptContent && (runStatus === 'failed' || runStatus === 'stopped' || runStatus === 'error');

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

  const isTerminal = runStatus && (['completed', 'failed', 'stopped', 'error'] as RunStatus[]).includes(runStatus);

  // Handler to dismiss summary and go back to the log/tab view
  const handleBackToRun = useCallback(() => {
    setShowSummary(false);
  }, []);

  // Handler to start a new run
  const handleNewRun = useCallback(() => {
    useRunStore.getState().resetRun();
    navigate('/');
  }, [navigate]);

  // Handler for re-run from summary page
  const handleSummaryRerun = useCallback(() => {
    setShowSummary(false);
    handleRerunScript();
  }, [handleRerunScript]);

  // Show summary page when execution is complete and showSummary is true
  if (showSummary && isTerminal) {
    return (
      <div className="flex flex-col flex-1 overflow-hidden bg-[#F9F6F1]">
        <Stepper runStatus={runStatus} />
        <SummaryPage
          runStatus={runStatus!}
          prompt={prompt}
          phases={phases}
          planOutput={planOutput}
          scriptContent={scriptContent}
          mainOutput={mainOutput}
          onBackToRun={handleBackToRun}
          onNewRun={handleNewRun}
          onRerun={canRerun ? handleSummaryRerun : undefined}
          className="flex-1"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden bg-[#F9F6F1]">
      <PromptBar prompt={prompt} />
      <Stepper runStatus={runStatus} />

      {/* Summary toggle button — shown when execution is done but user dismissed summary */}
      {isTerminal && !showSummary && (
        <div className="flex items-center justify-center px-4 py-1.5 bg-[#F3EDE3] border-b border-[#D4C5B0] shrink-0">
          <button
            onClick={() => setShowSummary(true)}
            className="text-xs font-medium text-[#5C1A1A] hover:text-[#2C1810] hover:underline transition-colors"
          >
            📊 View Execution Summary
          </button>
        </div>
      )}

      <TabBar tabs={tabs} activeTab={currentTab} onTabChange={setActiveTab} />

      <div className="flex flex-col flex-1 overflow-hidden">
        {renderTabContent()}
      </div>

      {canRerun && <FailedRunBar status={runStatus!} scriptPath={scriptContent ? `run.sh` : ''} onRerun={handleRerunScript} />}
      <RespondBar mode={respondMode} runId={routeRunId ?? runId} />
    </div>
  );
}
