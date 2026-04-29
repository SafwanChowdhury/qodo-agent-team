// ---------------------------------------------------------------------------
// Run status — mirrors the server-side status flow
// ---------------------------------------------------------------------------
export type RunStatus =
  | 'planning'
  | 'plan-review'
  | 'generating'
  | 'script-review'
  | 'running'
  | 'chatting'
  | 'completed'
  | 'failed'
  | 'stopped'
  | 'error';

// ---------------------------------------------------------------------------
// Phase — a single execution phase tracked by the log watcher
// ---------------------------------------------------------------------------
export interface Phase {
  label: string;
  status: 'running' | 'completed' | 'failed' | 'skipped';
  model?: string;
  output: string;
  summary?: string;
}

// ---------------------------------------------------------------------------
// Conversation message — used in the plan back-and-forth
// ---------------------------------------------------------------------------
export interface ConversationMessage {
  role: 'user' | 'agent';
  content: string;
}

// ---------------------------------------------------------------------------
// Model — as returned by GET /api/models
// ---------------------------------------------------------------------------
export interface Model {
  id: string;
  label: string;
  provider: string;
  tier: string;
}

// ---------------------------------------------------------------------------
// Browse result — as returned by GET /api/browse
// ---------------------------------------------------------------------------
export interface BrowseResult {
  current: string;
  parent: string;
  dirs: Array<{ name: string; path: string }>;
}

// ---------------------------------------------------------------------------
// Run state — the full client-side state for a single run
// ---------------------------------------------------------------------------
export interface RunState {
  view: 'setup' | 'run';
  projectPath: string;
  contextFolders: string[];
  prompt: string;
  planModel: string;
  generateModel: string;
  skipPlan: boolean;
  models: Model[];
  runId: string | null;
  runStatus: RunStatus | null;
  mainOutput: string;
  planOutput: string;
  planStreaming: string;
  planConversation: ConversationMessage[];
  phases: Record<string, Phase>;
  activeTab: string;
  scriptContent: string;
  generationOutput: string;
  showFolderBrowser: boolean;
  folderBrowserMode: 'project' | 'context';
  browserPath: string;
  browserDirs: Array<{ name: string; path: string }>;
  browserParent: string;
}

// ---------------------------------------------------------------------------
// Store actions — all mutations exposed by the Zustand store
// ---------------------------------------------------------------------------
export interface RunActions {
  setView: (view: 'setup' | 'run') => void;
  setProjectPath: (path: string) => void;
  addContextFolder: (path: string) => void;
  removeContextFolder: (path: string) => void;
  setPrompt: (prompt: string) => void;
  setPlanModel: (model: string) => void;
  setGenerateModel: (model: string) => void;
  setSkipPlan: (skip: boolean) => void;
  setModels: (models: Model[]) => void;
  setRunId: (id: string | null) => void;
  setRunStatus: (status: RunStatus | null) => void;
  appendMainOutput: (data: string) => void;
  setPlanOutput: (content: string) => void;
  appendPlanStreaming: (data: string) => void;
  setPlanConversation: (conversation: ConversationMessage[]) => void;
  setPhase: (phaseId: string, phase: Partial<Phase>) => void;
  appendPhaseOutput: (phaseId: string, data: string) => void;
  setActiveTab: (tab: string) => void;
  setScriptContent: (content: string) => void;
  appendGenerationOutput: (data: string) => void;
  setShowFolderBrowser: (show: boolean) => void;
  setFolderBrowserMode: (mode: 'project' | 'context') => void;
  setBrowserData: (data: { path: string; dirs: Array<{ name: string; path: string }>; parent: string }) => void;
  resetRun: () => void;
}

// ---------------------------------------------------------------------------
// Combined store type
// ---------------------------------------------------------------------------
export type RunStore = RunState & RunActions;

// ---------------------------------------------------------------------------
// Socket event payloads — typed payloads for server → client events
// ---------------------------------------------------------------------------
export interface RunCreatedPayload {
  runId: string;
}

export interface RunStatusPayload {
  status: RunStatus;
  exitCode?: number;
}

export interface RunOutputPayload {
  stream: 'main';
  data: string;
}

export interface PlanStreamPayload {
  data: string;
}

export interface PlanPayload {
  content: string;
}

export interface PlanConversationPayload {
  conversation: ConversationMessage[];
}

export interface GenerationPayload {
  data: string;
}

export interface ScriptPayload {
  content: string;
}

export interface PhasePayload {
  phaseId: string;
  label: string;
  status: 'running' | 'completed' | 'failed' | 'skipped';
  model?: string;
  output?: string;
  summary?: string;
}

export interface PhaseOutputPayload {
  phaseId: string;
  data: string;
}

export interface RunErrorPayload {
  error: string;
}

// ---------------------------------------------------------------------------
// Previous run — as returned by GET /api/previous-runs
// ---------------------------------------------------------------------------
export interface PreviousRun {
  id: string;
  dirPath: string;
  hasScript: boolean;
  hasPlan: boolean;
  logFiles: string[];
  projectPath: string;
  planSummary: string;
  scriptSize: number;
  isActive: boolean;
  modifiedAt: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Parsed script structures — used by the ScriptVisualizer
// ---------------------------------------------------------------------------
export interface ParsedPhase {
  id: string;
  number: string;
  label: string;
  model: string;
  modelVar: string;
  isParallel: boolean;
  parallelGroup?: string;
  skipCheck?: string;
  prompt: string;
  files?: string[];
  hasCheckpoint: boolean;
  checkpointLabel?: string;
  rawBlock: string;
}

export interface ParsedBrief {
  title: string;
  content: string;
}

export interface ParsedConfig {
  projectPath: string;
  logDir: string;
  opusModel: string;
  sonnetModel: string;
}

export interface ParsedScript {
  config: ParsedConfig;
  brief: ParsedBrief;
  phases: ParsedPhase[];
  preflightChecks: string[];
  rawScript: string;
}
