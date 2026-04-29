import { io, Socket } from 'socket.io-client';
import type {
  RunCreatedPayload,
  RunStatusPayload,
  RunOutputPayload,
  PlanStreamPayload,
  PlanPayload,
  PlanConversationPayload,
  GenerationPayload,
  ScriptPayload,
  PhasePayload,
  PhaseOutputPayload,
  RunErrorPayload,
} from '@/types';

// ---------------------------------------------------------------------------
// Server → Client event map
// ---------------------------------------------------------------------------
interface ServerToClientEvents {
  'run:created': (payload: RunCreatedPayload) => void;
  'run:status': (payload: RunStatusPayload) => void;
  'run:output': (payload: RunOutputPayload) => void;
  'run:plan-stream': (payload: PlanStreamPayload) => void;
  'run:plan': (payload: PlanPayload) => void;
  'run:plan-conversation': (payload: PlanConversationPayload) => void;
  'run:generation': (payload: GenerationPayload) => void;
  'run:script': (payload: ScriptPayload) => void;
  'run:phase': (payload: PhasePayload) => void;
  'run:phase-output': (payload: PhaseOutputPayload) => void;
  'run:error': (payload: RunErrorPayload) => void;
}

// ---------------------------------------------------------------------------
// Client → Server event map
// ---------------------------------------------------------------------------
interface ClientToServerEvents {
  'run:start': (data: {
    prompt: string;
    projectPath: string;
    contextFolders?: string[];
    planModel: string;
    generateModel: string;
    skipPlan?: boolean;
  }) => void;
  'run:join': (runId: string) => void;
  'run:plan-message': (data: { runId: string; message: string }) => void;
  'run:approve-plan': (data: { runId: string; editedPlan?: string }) => void;
  'run:approve-script': (data: { runId: string }) => void;
  'run:reject-script': (data: { runId: string; feedback: string }) => void;
  'run:regenerate-script': (data: { runId: string }) => void;
  'run:rerun-script': (data: { runId: string }) => void;
  'run:restore': (data: { runId: string; execute?: boolean }) => void;
  'run:replan': (data: { runId: string; feedback: string }) => void;
}

// ---------------------------------------------------------------------------
// Typed socket instance — singleton
// ---------------------------------------------------------------------------
export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io({
  autoConnect: true,
});

// ---------------------------------------------------------------------------
// Typed emit helpers for client → server events
// ---------------------------------------------------------------------------
export function emitRunStart(data: {
  prompt: string;
  projectPath: string;
  planModel: string;
  generateModel: string;
}) {
  socket.emit('run:start', data);
}

export function emitRunJoin(runId: string) {
  socket.emit('run:join', runId);
}

export function emitPlanMessage(runId: string, message: string) {
  socket.emit('run:plan-message', { runId, message });
}

export function emitApprovePlan(runId: string, editedPlan?: string) {
  socket.emit('run:approve-plan', { runId, editedPlan });
}

export function emitApproveScript(runId: string) {
  socket.emit('run:approve-script', { runId });
}

export function emitRejectScript(runId: string, feedback: string) {
  socket.emit('run:reject-script', { runId, feedback });
}

export function emitRegenerateScript(runId: string) {
  socket.emit('run:regenerate-script', { runId });
}

export function emitRerunScript(runId: string) {
  socket.emit('run:rerun-script', { runId });
}

export function emitRestoreRun(runId: string, execute?: boolean) {
  socket.emit('run:restore', { runId, execute });
}

export function emitReplan(runId: string, feedback: string) {
  socket.emit('run:replan', { runId, feedback });
}
