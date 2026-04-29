import { create } from 'zustand';
import type {
  RunStore,
  RunStatus,
  Model,
  Phase,
  ConversationMessage,
} from '@/types';

// ---------------------------------------------------------------------------
// Default / initial state values
// ---------------------------------------------------------------------------
const DEFAULT_MODEL = 'anthropic/claude-sonnet-4-6';

const initialState = {
  view: 'setup' as const,
  projectPath: '',
  contextFolders: [] as string[],
  prompt: '',
  planModel: DEFAULT_MODEL,
  generateModel: DEFAULT_MODEL,
  skipPlan: false,
  models: [] as Model[],
  runId: null as string | null,
  runStatus: null as RunStatus | null,
  mainOutput: '',
  planOutput: '',
  planStreaming: '',
  planConversation: [] as ConversationMessage[],
  phases: {} as Record<string, Phase>,
  activeTab: 'output',
  scriptContent: '',
  generationOutput: '',
  showFolderBrowser: false,
  folderBrowserMode: 'project' as const,
  browserPath: '',
  browserDirs: [] as Array<{ name: string; path: string }>,
  browserParent: '',
};

// ---------------------------------------------------------------------------
// Zustand store
// ---------------------------------------------------------------------------
export const useRunStore = create<RunStore>((set) => ({
  // --- State ---
  ...initialState,

  // --- Actions ---
  setView: (view) => set({ view }),

  setProjectPath: (projectPath) => set({ projectPath }),

  addContextFolder: (path) =>
    set((state) => ({
      contextFolders: state.contextFolders.includes(path)
        ? state.contextFolders
        : [...state.contextFolders, path],
    })),

  removeContextFolder: (path) =>
    set((state) => ({
      contextFolders: state.contextFolders.filter((f) => f !== path),
    })),

  setPrompt: (prompt) => set({ prompt }),

  setPlanModel: (planModel) => set({ planModel }),

  setGenerateModel: (generateModel) => set({ generateModel }),

  setSkipPlan: (skipPlan) => set({ skipPlan }),

  setModels: (models) => set({ models }),

  setRunId: (runId) => set({ runId }),

  setRunStatus: (runStatus) => set({ runStatus }),

  appendMainOutput: (data) =>
    set((state) => ({ mainOutput: state.mainOutput + data })),

  setPlanOutput: (planOutput) => set({ planOutput }),

  appendPlanStreaming: (data) =>
    set((state) => ({ planStreaming: state.planStreaming + data })),

  setPlanConversation: (planConversation) => set({ planConversation }),

  setPhase: (phaseId, phaseUpdate) =>
    set((state) => {
      const existing = state.phases[phaseId];
      const updated: Phase = existing
        ? { ...existing, ...phaseUpdate }
        : {
            label: phaseUpdate.label ?? phaseId,
            status: phaseUpdate.status ?? 'running',
            model: phaseUpdate.model,
            output: phaseUpdate.output ?? '',
            summary: phaseUpdate.summary,
          };
      return {
        phases: { ...state.phases, [phaseId]: updated },
      };
    }),

  appendPhaseOutput: (phaseId, data) =>
    set((state) => {
      const existing = state.phases[phaseId];
      if (!existing) return state;
      return {
        phases: {
          ...state.phases,
          [phaseId]: { ...existing, output: existing.output + data },
        },
      };
    }),

  setActiveTab: (activeTab) => set({ activeTab }),

  setScriptContent: (scriptContent) => set({ scriptContent }),

  appendGenerationOutput: (data) =>
    set((state) => ({ generationOutput: state.generationOutput + data })),

  setShowFolderBrowser: (showFolderBrowser) => set({ showFolderBrowser }),

  setFolderBrowserMode: (folderBrowserMode) => set({ folderBrowserMode }),

  setBrowserData: ({ path, dirs, parent }) =>
    set({ browserPath: path, browserDirs: dirs, browserParent: parent }),

  resetRun: () =>
    set({
      view: 'setup',
      runId: null,
      runStatus: null,
      mainOutput: '',
      planOutput: '',
      planStreaming: '',
      planConversation: [],
      phases: {},
      activeTab: 'output',
      scriptContent: '',
      generationOutput: '',
    }),
}));
