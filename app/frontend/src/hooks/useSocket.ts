import { useEffect } from 'react';
import { socket } from '@/lib/socket';
import { useRunStore } from '@/store/runStore';
import type {
  RunCreatedPayload,
  RunStatusPayload,
  RunOutputPayload,
  PlanStreamPayload,
  PlanConversationPayload,
  GenerationPayload,
  ScriptPayload,
  PhasePayload,
  PhaseOutputPayload,
  RunErrorPayload,
} from '@/types';

/**
 * Registers all Socket.IO event listeners on mount and cleans up on unmount.
 * Each event handler updates the Zustand store so the UI stays in sync.
 *
 * Call this once at the top level of the app (e.g. in App.tsx).
 */
export function useSocket() {
  useEffect(() => {
    const store = useRunStore.getState;
    const {
      setRunId,
      setRunStatus,
      setView,
      appendMainOutput,
      appendPlanStreaming,
      setPlanOutput,
      setPlanConversation,
      appendGenerationOutput,
      setScriptContent,
      setPhase,
      appendPhaseOutput,
    } = useRunStore.getState();

    // ----- run:created -----
    function onRunCreated(payload: RunCreatedPayload) {
      setRunId(payload.runId);
      setView('run');
    }

    // ----- run:status -----
    function onRunStatus(payload: RunStatusPayload) {
      setRunStatus(payload.status);

      // Auto-switch to the plan tab when entering plan-review
      if (payload.status === 'plan-review') {
        useRunStore.getState().setActiveTab('plan');
      }

      // Auto-switch to the script tab when entering script-review
      if (payload.status === 'script-review') {
        useRunStore.getState().setActiveTab('script');
      }

      // Auto-switch to the output tab when execution starts
      if (payload.status === 'running') {
        useRunStore.getState().setActiveTab('output');
      }
    }

    // ----- run:output -----
    function onRunOutput(payload: RunOutputPayload) {
      appendMainOutput(payload.data);
    }

    // ----- run:plan-stream -----
    function onPlanStream(payload: PlanStreamPayload) {
      appendPlanStreaming(payload.data);
    }

    // ----- run:plan -----
    function onPlan(payload: { content: string }) {
      setPlanOutput(payload.content);
    }

    // ----- run:plan-conversation -----
    function onPlanConversation(payload: PlanConversationPayload) {
      setPlanConversation(payload.conversation);

      // When we receive a full conversation update, the latest agent message
      // becomes the current plan output and we clear the streaming buffer.
      const agentMessages = payload.conversation.filter((m) => m.role === 'agent');
      if (agentMessages.length > 0) {
        const latestPlan = agentMessages[agentMessages.length - 1].content;
        setPlanOutput(latestPlan);
        // Clear the streaming buffer since we now have the full response
        useRunStore.setState({ planStreaming: '' });
      }
    }

    // ----- run:generation -----
    function onGeneration(payload: GenerationPayload) {
      appendGenerationOutput(payload.data);
    }

    // ----- run:script -----
    function onScript(payload: ScriptPayload) {
      setScriptContent(payload.content);
    }

    // ----- run:phase -----
    function onPhase(payload: PhasePayload) {
      setPhase(payload.phaseId, {
        label: payload.label,
        status: payload.status,
        model: payload.model,
        output: payload.output ?? store().phases[payload.phaseId]?.output ?? '',
        ...(payload.summary !== undefined && { summary: payload.summary }),
      });
    }

    // ----- run:phase-output -----
    function onPhaseOutput(payload: PhaseOutputPayload) {
      appendPhaseOutput(payload.phaseId, payload.data);
    }

    // ----- run:error -----
    function onRunError(payload: RunErrorPayload) {
      appendMainOutput(`\n[Error] ${payload.error}\n`);
    }

    // Register listeners
    socket.on('run:created', onRunCreated);
    socket.on('run:status', onRunStatus);
    socket.on('run:output', onRunOutput);
    socket.on('run:plan-stream', onPlanStream);
    socket.on('run:plan', onPlan);
    socket.on('run:plan-conversation', onPlanConversation);
    socket.on('run:generation', onGeneration);
    socket.on('run:script', onScript);
    socket.on('run:phase', onPhase);
    socket.on('run:phase-output', onPhaseOutput);
    socket.on('run:error', onRunError);

    // Cleanup on unmount
    return () => {
      socket.off('run:created', onRunCreated);
      socket.off('run:status', onRunStatus);
      socket.off('run:output', onRunOutput);
      socket.off('run:plan-stream', onPlanStream);
      socket.off('run:plan', onPlan);
      socket.off('run:plan-conversation', onPlanConversation);
      socket.off('run:generation', onGeneration);
      socket.off('run:script', onScript);
      socket.off('run:phase', onPhase);
      socket.off('run:phase-output', onPhaseOutput);
      socket.off('run:error', onRunError);
    };
  }, []);
}
