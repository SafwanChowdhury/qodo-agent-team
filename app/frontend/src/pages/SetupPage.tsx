import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderOpen, Rocket, Zap } from 'lucide-react';
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
import { socket } from '@/lib/socket';
import type { RunCreatedPayload } from '@/types';

export default function SetupPage() {
  const navigate = useNavigate();

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
  const setShowFolderBrowser = useRunStore((s) => s.setShowFolderBrowser);
  const setRunId = useRunStore((s) => s.setRunId);
  const setView = useRunStore((s) => s.setView);

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
      planModel,
      generateModel,
      skipPlan,
    });
  }

  const canSubmit = projectPath.trim().length > 0 && prompt.trim().length > 0;
  const providerNames = Object.keys(groupedModels).sort();

  return (
    <div className="flex flex-col flex-1 overflow-y-auto bg-[#F9F6F1]">
      <div className="flex flex-col items-center w-full px-4 py-12">

        {/* Page heading */}
        <div className="w-full max-w-2xl mb-8 text-center">
          <div className="inline-flex items-center justify-center h-12 w-12 rounded-xl bg-[#5C1A1A] mb-4 shadow-sm">
            <Rocket className="h-6 w-6 text-[#F9F6F1]" />
          </div>
          <h1 className="text-2xl font-bold text-[#2C1810] tracking-tight mb-2">
            New Agent Team Run
          </h1>
          <p className="text-sm text-[#7A5C4A]">
            Describe your task and configure the models — the agent team will plan, generate, and execute.
          </p>
        </div>

        {/* Card */}
        <div className="w-full max-w-2xl rounded-xl border border-[#D4C5B0] bg-white shadow-sm overflow-hidden">

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
                  onClick={() => setShowFolderBrowser(true)}
                >
                  <FolderOpen className="h-4 w-4" />
                  Browse
                </Button>
              </div>
              <p className="text-xs text-[#A08570] mt-1.5">
                The root directory of the project the agent team will work on.
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

        <p className="mt-6 text-xs text-[#A08570] text-center">
          The agent team will plan your task, generate a script, and execute it step by step.
        </p>
      </div>

      <FolderBrowser />
    </div>
  );
}
