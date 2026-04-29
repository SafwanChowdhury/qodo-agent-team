import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FolderOpen,
  FolderPlus,
  Rocket,
  Zap,
  Clock,
  FileCode,
  FileText,
  ScrollText,
  Play,
  Eye,
  RefreshCw,
  Loader2,
  Trash2,
  X,
  History,
  ChevronsRight,
  BookOpen,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FolderBrowser } from '@/components/FolderBrowser';
import { useRunStore } from '@/store/runStore';
import { useModels } from '@/hooks/useModels';
import { socket, emitRestoreRun } from '@/lib/socket';
import { cn } from '@/lib/utils';
import type { RunCreatedPayload, PreviousRun } from '@/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Cross-platform basename: handle both forward and back slashes (Windows paths
// like `C:\Users\foo\proj` and POSIX paths like `/Users/foo/proj`).
function basename(p: string): string {
  if (!p) return '';
  return p.split(/[\\/]+/).filter(Boolean).pop() || p;
}

// ---------------------------------------------------------------------------
// Drawer Run Item
// ---------------------------------------------------------------------------

interface DrawerRunItemProps {
  run: PreviousRun;
  onReview: (runId: string) => void;
  onExecute: (runId: string) => void;
  onDelete: (runId: string) => void;
  deleting: boolean;
}

function DrawerRunItem({ run, onReview, onExecute, onDelete, deleting }: DrawerRunItemProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const projectName = run.projectPath ? basename(run.projectPath) : null;

  return (
    <div
      className={cn(
        'rounded-lg border transition-all duration-150',
        run.isActive
          ? 'border-[#2D6A2D]/40 bg-[#2D6A2D]/[0.03]'
          : 'border-[#E6DCCB] bg-white hover:border-[#C9B99A] hover:shadow-sm'
      )}
    >
      <div className="px-3 py-2.5">
        {/* Header: ID + time + delete */}
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <code className="text-[10px] font-mono font-bold text-[#5C1A1A] bg-[#5C1A1A]/[0.06] px-1 py-0.5 rounded shrink-0">
              {run.id}
            </code>
            {run.isActive && (
              <span className="text-[9px] font-semibold text-[#2D6A2D] bg-[#2D6A2D]/10 px-1 py-0.5 rounded uppercase tracking-wider shrink-0">
                Active
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-[10px] text-[#A08570]">
              {formatRelativeTime(run.modifiedAt)}
            </span>
            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="p-0.5 rounded text-[#A08570] hover:text-[#B71C1C] hover:bg-[#B71C1C]/10 transition-colors"
                title="Delete run"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            ) : (
              <div className="flex items-center gap-0.5">
                <button
                  onClick={() => { onDelete(run.id); setConfirmDelete(false); }}
                  disabled={deleting}
                  className="px-1.5 py-0.5 rounded text-[10px] font-medium text-white bg-[#B71C1C] hover:bg-[#8B1515] transition-colors disabled:opacity-50"
                >
                  {deleting ? '…' : 'Delete'}
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="p-0.5 rounded text-[#A08570] hover:text-[#2C1810] hover:bg-[#EDE5D8] transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Project name */}
        {projectName && (
          <p className="text-xs font-medium text-[#2C1810] truncate" title={run.projectPath}>
            {projectName}
          </p>
        )}

        {/* Plan summary */}
        {run.planSummary && (
          <p className="text-[11px] text-[#7A5C4A] line-clamp-1 mt-0.5 leading-snug">
            {run.planSummary}
          </p>
        )}

        {/* Artifacts */}
        <div className="flex items-center gap-2 mt-1.5 mb-2">
          {run.hasScript && (
            <span className="flex items-center gap-0.5 text-[10px] text-[#2D6A2D]">
              <FileCode className="h-2.5 w-2.5" />
              run.sh
              {run.scriptSize > 0 && (
                <span className="text-[#A08570]">({formatBytes(run.scriptSize)})</span>
              )}
            </span>
          )}
          {run.hasPlan && (
            <span className="flex items-center gap-0.5 text-[10px] text-[#6B2D6B]">
              <FileText className="h-2.5 w-2.5" />
              plan
            </span>
          )}
          {run.logFiles.length > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] text-[#8B6914]">
              <ScrollText className="h-2.5 w-2.5" />
              {run.logFiles.length}
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="flex-1 gap-1 text-[11px] h-7 px-2"
            onClick={() => onReview(run.id)}
          >
            <Eye className="h-3 w-3" />
            Review
          </Button>
          {run.hasScript && (
            <Button
              variant="default"
              size="sm"
              className="flex-1 gap-1 text-[11px] h-7 px-2"
              onClick={() => onExecute(run.id)}
            >
              <Play className="h-3 w-3" />
              Execute
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Previous Runs Drawer
// ---------------------------------------------------------------------------

interface PreviousRunsDrawerProps {
  open: boolean;
  onToggle: () => void;
  onReview: (runId: string) => void;
  onExecute: (runId: string) => void;
}

function PreviousRunsDrawer({ open, onToggle, onReview, onExecute }: PreviousRunsDrawerProps) {
  const [runs, setRuns] = useState<PreviousRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const hasFetched = useRef(false);

  const fetchRuns = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/previous-runs');
      if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
      const data = await res.json();
      setRuns(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch when drawer opens for the first time, and refresh on subsequent opens
  useEffect(() => {
    if (open) {
      fetchRuns();
      hasFetched.current = true;
    }
  }, [open, fetchRuns]);

  const handleDelete = useCallback(async (runId: string) => {
    setDeletingId(runId);
    try {
      const res = await fetch(`/api/previous-runs/${runId}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Delete failed');
      }
      setRuns((prev) => prev.filter((r) => r.id !== runId));
    } catch (err) {
      // Could show a toast, but for now just log
      console.error('Delete failed:', err);
    } finally {
      setDeletingId(null);
    }
  }, []);

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/20 backdrop-blur-[1px] z-40 transition-opacity duration-300"
          onClick={onToggle}
        />
      )}

      {/* Drawer panel */}
      <div
        className={cn(
          'fixed top-0 left-0 h-full z-50 flex transition-transform duration-300 ease-out',
          open ? 'translate-x-0' : '-translate-x-[340px]'
        )}
      >
        {/* Drawer content */}
        <div className="w-[340px] h-full bg-[#F9F6F1] border-r border-[#D4C5B0] shadow-[4px_0_24px_-8px_rgba(44,24,16,0.15)] flex flex-col">
          {/* Drawer header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#D4C5B0] bg-white shrink-0">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-[#5C1A1A]" />
              <h2 className="text-sm font-semibold text-[#2C1810]">Previous Runs</h2>
              {runs.length > 0 && (
                <span className="text-[10px] text-[#A08570] bg-[#EDE5D8] px-1.5 py-0.5 rounded-full font-medium">
                  {runs.length}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={fetchRuns}
                disabled={loading}
                className="p-1.5 rounded-md text-[#7A5C4A] hover:text-[#5C1A1A] hover:bg-[#F3EDE3] transition-colors disabled:opacity-50"
                title="Refresh"
              >
                <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
              </button>
              <button
                onClick={onToggle}
                className="p-1.5 rounded-md text-[#7A5C4A] hover:text-[#5C1A1A] hover:bg-[#F3EDE3] transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Drawer body */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
            {loading && runs.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <Loader2 className="h-5 w-5 text-[#A08570] animate-spin" />
                <span className="text-xs text-[#A08570]">Scanning /tmp…</span>
              </div>
            )}

            {error && (
              <div className="text-center py-8">
                <p className="text-xs text-[#B71C1C] mb-2">{error}</p>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={fetchRuns}>
                  <RefreshCw className="h-3 w-3" />
                  Retry
                </Button>
              </div>
            )}

            {!loading && !error && runs.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
                <History className="h-8 w-8 text-[#D4C5B0]" />
                <p className="text-sm text-[#A08570]">No previous runs found</p>
                <p className="text-[11px] text-[#C9B99A]">
                  Runs are stored in /tmp/qodo-team-*
                </p>
              </div>
            )}

            {runs.map((run) => (
              <DrawerRunItem
                key={run.id}
                run={run}
                onReview={onReview}
                onExecute={onExecute}
                onDelete={handleDelete}
                deleting={deletingId === run.id}
              />
            ))}
          </div>
        </div>

        {/* Pull tab — always visible, attached to drawer edge */}
        <button
          onClick={onToggle}
          className={cn(
            'self-center -ml-px flex flex-col items-center justify-center gap-4',
            'w-9 h-32 rounded-r-xl',
            'bg-white border border-l-0 border-[#D4C5B0]',
            'shadow-[2px_0_8px_-4px_rgba(44,24,16,0.12)]',
            'text-[#7A5C4A] hover:text-[#5C1A1A] hover:bg-[#F9F3EC]',
            'transition-colors duration-150',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5C1A1A]'
          )}
          title={open ? 'Close previous runs' : 'View previous runs'}
        >
          <ChevronsRight
            className={cn(
              'h-4 w-4 shrink-0 transition-transform duration-300',
              open ? 'rotate-180' : 'rotate-0'
            )}
          />
          <span
            className="text-[10px] font-semibold uppercase tracking-[0.1em] leading-none whitespace-nowrap"
            style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
          >
            Older Runs
          </span>
        </button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// SetupPage
// ---------------------------------------------------------------------------

export default function SetupPage() {
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const projectPath = useRunStore((s) => s.projectPath);
  const prompt = useRunStore((s) => s.prompt);
  const planModel = useRunStore((s) => s.planModel);
  const generateModel = useRunStore((s) => s.generateModel);
  const setProjectPath = useRunStore((s) => s.setProjectPath);
  const setPrompt = useRunStore((s) => s.setPrompt);
  const setPlanModel = useRunStore((s) => s.setPlanModel);
  const setGenerateModel = useRunStore((s) => s.setGenerateModel);
  const skipPlan = useRunStore((s) => s.skipPlan);
  const setSkipPlan = useRunStore((s) => s.setSkipPlan);
  const contextFolders = useRunStore((s) => s.contextFolders);
  const addContextFolder = useRunStore((s) => s.addContextFolder);
  const removeContextFolder = useRunStore((s) => s.removeContextFolder);
  const setShowFolderBrowser = useRunStore((s) => s.setShowFolderBrowser);
  const setFolderBrowserMode = useRunStore((s) => s.setFolderBrowserMode);
  const setRunId = useRunStore((s) => s.setRunId);
  const setView = useRunStore((s) => s.setView);
  const resetRun = useRunStore((s) => s.resetRun);

  const { groupedModels, loading: modelsLoading, error: modelsError } = useModels();

  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  useEffect(() => {
    function onRunCreated(payload: RunCreatedPayload) {
      setRunId(payload.runId);
      setView('run');
      navigateRef.current(`/run/${payload.runId}`);
    }

    socket.on('run:created', onRunCreated);
    return () => {
      socket.off('run:created', onRunCreated);
    };
  }, [setRunId, setView]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!projectPath.trim() || !prompt.trim()) return;

    socket.emit('run:start', {
      prompt: prompt.trim(),
      projectPath: projectPath.trim(),
      contextFolders,
      planModel,
      generateModel,
      skipPlan,
    });
  }

  const handleReviewRun = useCallback(
    (runId: string) => {
      resetRun();
      setDrawerOpen(false);
      emitRestoreRun(runId, false);
    },
    [resetRun]
  );

  const handleExecuteRun = useCallback(
    (runId: string) => {
      resetRun();
      setDrawerOpen(false);
      emitRestoreRun(runId, true);
    },
    [resetRun]
  );

  const canSubmit = projectPath.trim().length > 0 && prompt.trim().length > 0;
  const providerNames = Object.keys(groupedModels).sort();

  return (
    <div className="relative flex flex-col flex-1 overflow-y-auto bg-[#F9F6F1]">
      {/* Subtle background grain / radial wash */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px]"
        style={{
          background:
            'radial-gradient(ellipse 60% 60% at 50% 0%, rgba(92,26,26,0.06), transparent 70%)',
        }}
      />

      <div className="relative flex flex-col items-center w-full px-4 pt-10 pb-16">

        {/* Page heading */}
        <div className="w-full max-w-2xl mb-10 text-center">
          <h1 className="font-display text-[44px] leading-[1.05] font-light text-[#2C1810] mb-4">
            Put your <em className="italic font-normal text-[#5C1A1A]">agent team</em>
            <br />
            to work.
          </h1>
          <p className="text-[15px] leading-relaxed text-[#7A5C4A] max-w-lg mx-auto">
            Describe the task, pick the models, and the team will plan,
            generate, and execute — end to end.
          </p>
        </div>

        {/* Card */}
        <div className="w-full max-w-2xl rounded-2xl border border-[#E6DCCB] bg-white/90 backdrop-blur-sm shadow-[0_1px_2px_rgba(44,24,16,0.04),0_12px_40px_-12px_rgba(44,24,16,0.12)] overflow-hidden">

          <form onSubmit={handleSubmit} className="divide-y divide-[#EDE5D8]">

            {/* Project Folder */}
            <div className="px-6 py-5">
              <label className="block text-sm font-semibold text-[#2C1810] mb-1.5">
                Project Folder
              </label>
              <div className="flex gap-2">
                <Input
                  value={projectPath}
                  onChange={(e) => setProjectPath(e.target.value)}
                  placeholder="/path/to/your/project"
                  className="font-mono text-xs flex-1"
                  spellCheck={false}
                  autoComplete="off"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="default"
                  className="shrink-0 gap-1.5"
                  onClick={() => {
                    setFolderBrowserMode('project');
                    setShowFolderBrowser(true);
                  }}
                >
                  <FolderOpen className="h-4 w-4" />
                  Browse
                </Button>
              </div>
              <p className="text-xs text-[#A08570] mt-1.5">
                The root directory of the project the agent team will work on.
              </p>
            </div>

            {/* Context Folders */}
            <div className="px-6 py-5">
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-semibold text-[#2C1810]">
                  <span className="flex items-center gap-1.5">
                    <BookOpen className="h-3.5 w-3.5 text-[#8B6914]" />
                    Context Folders
                  </span>
                </label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs h-7"
                  onClick={() => {
                    setFolderBrowserMode('context');
                    setShowFolderBrowser(true);
                  }}
                >
                  <FolderPlus className="h-3.5 w-3.5" />
                  Add Folder
                </Button>
              </div>

              {contextFolders.length > 0 ? (
                <div className="space-y-1.5">
                  {contextFolders.map((folder) => {
                    const folderName = basename(folder) || folder;
                    return (
                      <div
                        key={folder}
                        className="flex items-center gap-2 rounded-md bg-[#F9F6F1] border border-[#E6DCCB] px-3 py-2 group"
                      >
                        <FolderOpen className="h-3.5 w-3.5 text-[#8B6914] shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-medium text-[#2C1810] block truncate">
                            {folderName}
                          </span>
                          <span className="font-mono text-[10px] text-[#A08570] block truncate">
                            {folder}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeContextFolder(folder)}
                          className="p-1 rounded text-[#A08570] hover:text-[#B71C1C] hover:bg-[#B71C1C]/10 transition-colors opacity-0 group-hover:opacity-100"
                          title="Remove context folder"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-md border border-dashed border-[#D4C5B0] bg-[#F9F6F1]/50 px-4 py-3 text-center">
                  <p className="text-xs text-[#A08570]">
                    No context folders added yet
                  </p>
                </div>
              )}

              <p className="text-xs text-[#A08570] mt-1.5">
                Additional folders the agents can reference for context (read-only). These won't be modified.
              </p>
            </div>

            {/* Models */}
            <div className="px-6 py-5">
              <label className="block text-sm font-semibold text-[#2C1810] mb-1.5">
                Models
              </label>

              {modelsError && (
                <p className="text-xs text-[#B71C1C] mb-2 flex items-center gap-1">
                  <span>⚠</span> Could not load models: {modelsError}
                </p>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-[#7A5C4A]">Plan Model</span>
                  <Select
                    value={planModel}
                    onValueChange={setPlanModel}
                    disabled={modelsLoading}
                  >
                    <SelectTrigger className="w-full">
                      {modelsLoading ? (
                        <span className="text-[#A08570] flex items-center gap-1.5">
                          <span className="h-3 w-3 border border-[#5C1A1A] border-t-transparent rounded-full animate-spin inline-block" />
                          Loading…
                        </span>
                      ) : (
                        <SelectValue placeholder="Select plan model" />
                      )}
                    </SelectTrigger>
                    <SelectContent>
                      {providerNames.map((provider) => (
                        <SelectGroup key={provider}>
                          <SelectLabel>{provider}</SelectLabel>
                          {groupedModels[provider].map((model) => (
                            <SelectItem key={model.id} value={model.id}>
                              {model.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                      {providerNames.length === 0 && !modelsLoading && (
                        <div className="px-2 py-3 text-xs text-[#A08570] text-center">
                          No models available
                        </div>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-[#7A5C4A]">Generate Model</span>
                  <Select
                    value={generateModel}
                    onValueChange={setGenerateModel}
                    disabled={modelsLoading}
                  >
                    <SelectTrigger className="w-full">
                      {modelsLoading ? (
                        <span className="text-[#A08570] flex items-center gap-1.5">
                          <span className="h-3 w-3 border border-[#5C1A1A] border-t-transparent rounded-full animate-spin inline-block" />
                          Loading…
                        </span>
                      ) : (
                        <SelectValue placeholder="Select generate model" />
                      )}
                    </SelectTrigger>
                    <SelectContent>
                      {providerNames.map((provider) => (
                        <SelectGroup key={provider}>
                          <SelectLabel>{provider}</SelectLabel>
                          {groupedModels[provider].map((model) => (
                            <SelectItem key={model.id} value={model.id}>
                              {model.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                      {providerNames.length === 0 && !modelsLoading && (
                        <div className="px-2 py-3 text-xs text-[#A08570] text-center">
                          No models available
                        </div>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <p className="text-xs text-[#A08570] mt-1.5">
                Plan model handles planning &amp; conversation; generate model writes the script.
              </p>
            </div>

            {/* Task Prompt */}
            <div className="px-6 py-5">
              <label className="block text-sm font-semibold text-[#2C1810] mb-1.5">
                Task Prompt
              </label>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe what you want the agent team to accomplish…"
                className="min-h-[160px] resize-y font-sans text-sm leading-relaxed"
                spellCheck
              />
              <p className="text-xs text-[#A08570] mt-1.5">
                Be specific — include context, constraints, and expected outcomes.
              </p>
            </div>

            {/* Skip Plan toggle + Submit */}
            <div className="px-6 py-5 bg-[#F3EDE3]">
              {/* Skip Plan Toggle */}
              <div
                className="flex items-center gap-3 px-4 py-3 rounded-lg border border-[#C9B99A] bg-white cursor-pointer select-none mb-5 hover:bg-[#FDF8F2] transition-colors"
                onClick={() => setSkipPlan(!skipPlan)}
              >
                <div
                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                    skipPlan ? 'bg-[#8B6914]' : 'bg-[#B0A090]'
                  }`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
                      skipPlan ? 'translate-x-[18px]' : 'translate-x-[3px]'
                    }`}
                  />
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-[#2C1810] flex items-center gap-1.5">
                    <Zap className="h-3.5 w-3.5 text-[#8B6914]" />
                    Skip Plan Stage
                  </span>
                  <span className="text-xs text-[#A08570]">
                    Go straight to script generation — uses your prompt as the plan.
                  </span>
                </div>
              </div>

              {/* Submit row */}
              <div className="flex items-center justify-between">
                <p className="text-xs text-[#A08570]">
                  {!canSubmit && (
                    <span>
                      {!projectPath.trim() && !prompt.trim()
                        ? 'Set a project folder and describe your task to continue.'
                        : !projectPath.trim()
                        ? 'Set a project folder to continue.'
                        : 'Describe your task to continue.'}
                    </span>
                  )}
                </p>

                <Button
                  type="submit"
                  variant="default"
                  size="default"
                  disabled={!canSubmit}
                  className="gap-2 font-semibold"
                >
                  {skipPlan ? (
                    <>
                      <Zap className="h-4 w-4" />
                      Generate &amp; Launch
                    </>
                  ) : (
                    <>
                      <Rocket className="h-4 w-4" />
                      Plan &amp; Launch
                    </>
                  )}
                </Button>
              </div>
            </div>

          </form>
        </div>

        <p className="mt-8 text-[11px] uppercase tracking-[0.16em] text-[#A08570] text-center">
          Plan · Generate · Execute
        </p>
      </div>

      {/* Previous Runs Drawer */}
      <PreviousRunsDrawer
        open={drawerOpen}
        onToggle={() => setDrawerOpen((o) => !o)}
        onReview={handleReviewRun}
        onExecute={handleExecuteRun}
      />

      <FolderBrowser />
    </div>
  );
}
