const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const chokidar = require('chokidar');
const treeKill = require('tree-kill');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  maxHttpBufferSize: 5e6,
});

app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Serve new Vite-built frontend from app/frontend/dist/
const frontendDist = path.join(__dirname, 'frontend', 'dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
}

// Available models
const AVAILABLE_MODELS = [
  { id: 'anthropic/claude-opus-4-7', label: 'Claude Opus 4.7', provider: 'Anthropic', tier: 'top' },
  { id: 'anthropic/claude-opus-4-6', label: 'Claude Opus 4.6', provider: 'Anthropic', tier: 'top' },
  { id: 'anthropic/claude-sonnet-4-6', label: 'Claude Sonnet 4.6', provider: 'Anthropic', tier: 'mid' },
  { id: 'anthropic/claude-haiku-4-5', label: 'Claude Haiku 4.5', provider: 'Anthropic', tier: 'fast' },
  { id: 'claude-opus-4-7', label: 'Claude Opus 4.7 (short)', provider: 'Anthropic', tier: 'top' },
  { id: 'claude-opus-4-6', label: 'Claude Opus 4.6 (short)', provider: 'Anthropic', tier: 'top' },
  { id: 'claude-opus-4-6-200k', label: 'Claude Opus 4.6 200k', provider: 'Anthropic', tier: 'top' },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (short)', provider: 'Anthropic', tier: 'mid' },
  { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5', provider: 'Anthropic', tier: 'mid' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 (short)', provider: 'Anthropic', tier: 'fast' },
  { id: 'claude-opus-4-5', label: 'Claude Opus 4.5', provider: 'Anthropic', tier: 'top' },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', provider: 'Google', tier: 'top' },
  { id: 'gpt-5.4', label: 'GPT-5.4', provider: 'OpenAI', tier: 'top' },
  { id: 'gpt-5.3-codex', label: 'GPT-5.3 Codex', provider: 'OpenAI', tier: 'top' },
  { id: 'gpt-5.2-ultra', label: 'GPT-5.2 Ultra', provider: 'OpenAI', tier: 'top' },
  { id: 'gpt-5.2-max', label: 'GPT-5.2 Max', provider: 'OpenAI', tier: 'top' },
  { id: 'gpt-5.2-pro', label: 'GPT-5.2 Pro', provider: 'OpenAI', tier: 'top' },
  { id: 'gpt-5.2-high', label: 'GPT-5.2 High', provider: 'OpenAI', tier: 'top' },
  { id: 'gpt-5.2', label: 'GPT-5.2', provider: 'OpenAI', tier: 'mid' },
  { id: 'gpt-5.2-codex', label: 'GPT-5.2 Codex', provider: 'OpenAI', tier: 'mid' },
  { id: 'gpt-5.1', label: 'GPT-5.1', provider: 'OpenAI', tier: 'mid' },
  { id: 'gpt-5.1-codex', label: 'GPT-5.1 Codex', provider: 'OpenAI', tier: 'mid' },
  { id: 'gpt-5', label: 'GPT-5', provider: 'OpenAI', tier: 'mid' },
  { id: 'gpt-5-mini', label: 'GPT-5 Mini', provider: 'OpenAI', tier: 'fast' },
  { id: 'gpt-5-nano', label: 'GPT-5 Nano', provider: 'OpenAI', tier: 'fast' },
  { id: 'o4-mini', label: 'o4-mini', provider: 'OpenAI', tier: 'fast' },
  { id: 'gpt-4.1-mini', label: 'GPT-4.1 Mini', provider: 'OpenAI', tier: 'fast' },
  { id: 'gpt-4.1-nano', label: 'GPT-4.1 Nano', provider: 'OpenAI', tier: 'fast' },
  { id: 'gpt-3.5-turbo-instruct', label: 'GPT-3.5 Turbo Instruct', provider: 'OpenAI', tier: 'fast' },
  { id: 'nemotron-super-3-120b', label: 'Nemotron Super 3 120B', provider: 'NVIDIA', tier: 'mid' },
  { id: 'grok-4', label: 'Grok 4', provider: 'xAI', tier: 'top' },
  { id: 'grok-code-fast-1', label: 'Grok Code Fast 1', provider: 'xAI', tier: 'fast' },
];

const activeRuns = new Map();

// ---------------------------------------------------------------------------
// REST API
// ---------------------------------------------------------------------------
app.get('/api/models', (req, res) => res.json(AVAILABLE_MODELS));

app.get('/api/browse', (req, res) => {
  const dirPath = req.query.path || process.env.HOME || '/';
  try {
    const resolved = path.resolve(dirPath);
    const entries = fs.readdirSync(resolved, { withFileTypes: true });
    const dirs = entries
      .filter(e => e.isDirectory() && !e.name.startsWith('.'))
      .map(e => ({ name: e.name, path: path.join(resolved, e.name) }))
      .sort((a, b) => a.name.localeCompare(b.name));
    res.json({ current: resolved, parent: path.dirname(resolved), dirs });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/runs', (req, res) => {
  const runs = [];
  for (const [id, run] of activeRuns) {
    runs.push({
      id, status: run.status, prompt: run.prompt.substring(0, 100),
      projectPath: run.projectPath, createdAt: run.createdAt,
    });
  }
  res.json(runs);
});

app.get('/api/runs/:id', (req, res) => {
  const run = activeRuns.get(req.params.id);
  if (!run) return res.status(404).json({ error: 'Run not found' });
  res.json({
    id: req.params.id, status: run.status, prompt: run.prompt,
    projectPath: run.projectPath, createdAt: run.createdAt,
    scriptPath: run.scriptPath, logDir: run.logDir,
    phases: run.phases, mainOutput: run.mainOutput,
    planOutput: run.planOutput, planModel: run.planModel,
    generateModel: run.generateModel,
    planConversation: run.planConversation,
  });
});

app.post('/api/runs/:id/stop', (req, res) => {
  const run = activeRuns.get(req.params.id);
  if (!run) return res.status(404).json({ error: 'Run not found' });
  const proc = run.process || run.planProcess || run.genProcess;
  if (proc && proc.pid) {
    treeKill(proc.pid, 'SIGTERM');
  }
  run.status = 'stopped';
  io.to(req.params.id).emit('run:status', { status: 'stopped' });
  res.json({ ok: true });
});

app.post('/api/runs/:id/respond', (req, res) => {
  const run = activeRuns.get(req.params.id);
  if (!run) return res.status(404).json({ error: 'Run not found' });
  if (run.process && run.process.stdin && !run.process.stdin.destroyed) {
    run.process.stdin.write(req.body.response + '\n');
    res.json({ ok: true });
  } else {
    res.status(400).json({ error: 'Process stdin not available' });
  }
});

app.post('/api/runs/:id/chat', (req, res) => {
  const run = activeRuns.get(req.params.id);
  if (!run) return res.status(404).json({ error: 'Run not found' });
  if (!run.sessionId) return res.status(400).json({ error: 'No session to resume' });

  const { message, model } = req.body;
  if (!message) return res.status(400).json({ error: 'Message required' });

  const chatModel = model || run.generateModel || 'anthropic/claude-sonnet-4-6';
  const qodoArgs = [
    '--ci', '-y', '--permissions=rwx',
    `--model=${chatModel}`,
    `--resume=${run.sessionId}`,
    message,
  ];

  const proc = spawn('qodo', qodoArgs, {
    cwd: run.projectPath, env: { ...process.env },
  });

  run.process = proc;
  run.status = 'chatting';
  io.to(run.id).emit('run:status', { status: 'chatting' });

  const chatHeader = `\n\n━━━ Follow-up Chat ━━━\n> ${message}\n\n`;
  run.mainOutput += chatHeader;
  io.to(run.id).emit('run:output', { stream: 'main', data: chatHeader });

  proc.stdout.on('data', (data) => {
    const text = data.toString();
    run.mainOutput += text;
    io.to(run.id).emit('run:output', { stream: 'main', data: text });
  });
  proc.stderr.on('data', (data) => {
    const text = data.toString();
    run.mainOutput += text;
    io.to(run.id).emit('run:output', { stream: 'main', data: text });
  });
  proc.on('close', (code) => {
    run.status = code === 0 ? 'completed' : 'failed';
    run.process = null;
    io.to(run.id).emit('run:status', { status: run.status });
  });

  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// SPA fallback — serve index.html for all non-API routes (must be after API routes)
// ---------------------------------------------------------------------------
if (fs.existsSync(frontendDist)) {
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/socket.io')) {
      const indexPath = path.join(frontendDist, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
      }
    }
  });
}

// ---------------------------------------------------------------------------
// WebSocket
// ---------------------------------------------------------------------------
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.on('run:join', (runId) => {
    socket.join(runId);
    const run = activeRuns.get(runId);
    if (run) {
      socket.emit('run:status', { status: run.status });
      socket.emit('run:output', { stream: 'main', data: run.mainOutput });
      if (run.planConversation.length > 0) {
        socket.emit('run:plan-conversation', { conversation: run.planConversation });
      }
      if (run.scriptContent) {
        socket.emit('run:script', { content: run.scriptContent });
      }
      for (const [phaseId, phase] of Object.entries(run.phases)) {
        socket.emit('run:phase', { phaseId, ...phase });
      }
    }
  });

  // Start a new run
  socket.on('run:start', async (data) => {
    const { prompt, projectPath, planModel, generateModel, skipPlan } = data;
    const runId = uuidv4().substring(0, 8);
    const logDir = `/tmp/qodo-team-${runId}`;
    const scriptPath = path.join(logDir, 'run.sh');

    fs.mkdirSync(logDir, { recursive: true });

    const run = {
      id: runId,
      prompt,
      projectPath,
      logDir,
      scriptPath,
      planModel: planModel || 'anthropic/claude-sonnet-4-6',
      generateModel: generateModel || 'anthropic/claude-sonnet-4-6',
      status: skipPlan ? 'generating' : 'planning',
      createdAt: new Date().toISOString(),
      mainOutput: '',
      planOutput: '',
      planConversation: [],   // { role: 'user'|'agent', content: string }
      scriptContent: '',
      phases: {},
      process: null,          // execution process
      planProcess: null,      // current plan qodo process (one-shot)
      genProcess: null,
      sessionId: null,        // session ID for post-execution --resume chat
      planSessionId: null,    // session ID for plan --resume follow-ups
      watcher: null,
      _planCurrentResponse: '',
    };

    activeRuns.set(runId, run);
    socket.join(runId);
    socket.emit('run:created', { runId });

    if (skipPlan) {
      // Skip plan stage — use the user's prompt directly as the plan context
      run.planOutput = prompt;
      io.to(runId).emit('run:status', { status: 'generating' });

      const skipMsg = '[Plan stage skipped — proceeding directly to script generation]\n';
      run.mainOutput += skipMsg;
      io.to(runId).emit('run:output', { stream: 'main', data: skipMsg });

      try {
        await runGenerateStage(run);
        if (run.status !== 'stopped') {
          // Pause for script review
          run.status = 'script-review';
          io.to(runId).emit('run:status', { status: 'script-review' });
          const reviewMsg = '[Script generated — waiting for review before execution]\n';
          run.mainOutput += reviewMsg;
          io.to(runId).emit('run:output', { stream: 'main', data: reviewMsg });
        }
      } catch (err) {
        run.status = 'error';
        io.to(runId).emit('run:error', { error: err.message });
        io.to(runId).emit('run:status', { status: 'error' });
      }
    } else {
      io.to(runId).emit('run:status', { status: 'planning' });

      try {
        startPlanProcess(run);
      } catch (err) {
        run.status = 'error';
        io.to(runId).emit('run:error', { error: err.message });
        io.to(runId).emit('run:status', { status: 'error' });
      }
    }
  });

  // User sends a message during plan review (back-and-forth via --resume)
  socket.on('run:plan-message', (data) => {
    const { runId, message } = data;
    const run = activeRuns.get(runId);
    if (!run) return;

    // If a plan process is still running, kill it first
    if (run.planProcess && run.planProcess.pid) {
      treeKill(run.planProcess.pid, 'SIGTERM');
      run.planProcess = null;
    }

    resumePlanProcess(run, message);
  });

  // User approves the plan → kill plan process, generate script, pause for review
  socket.on('run:approve-plan', async (data) => {
    const { runId, editedPlan } = data;
    const run = activeRuns.get(runId);
    if (!run) return;

    // Kill any in-flight plan process — we're done with planning
    if (run.planProcess && run.planProcess.pid) {
      treeKill(run.planProcess.pid, 'SIGTERM');
      run.planProcess = null;
    }

    // If user edited the plan text, use that
    if (editedPlan) {
      run.planOutput = editedPlan;
    }

    const approveMsg = '[Plan approved — proceeding to script generation]\n';
    run.mainOutput += approveMsg;
    io.to(runId).emit('run:output', { stream: 'main', data: approveMsg });

    try {
      await runGenerateStage(run);
      if (run.status !== 'stopped') {
        // Pause for script review instead of executing immediately
        run.status = 'script-review';
        io.to(runId).emit('run:status', { status: 'script-review' });
        const reviewMsg = '[Script generated — waiting for review before execution]\n';
        run.mainOutput += reviewMsg;
        io.to(runId).emit('run:output', { stream: 'main', data: reviewMsg });
      }
    } catch (err) {
      run.status = 'error';
      io.to(run.id).emit('run:error', { error: err.message });
      io.to(run.id).emit('run:status', { status: 'error' });
    }
  });

  // User approves the script → proceed to execution
  socket.on('run:approve-script', async (data) => {
    const { runId } = data;
    const run = activeRuns.get(runId);
    if (!run) return;
    if (run.status !== 'script-review') return;

    const approveMsg = '[Script approved — proceeding to execution]\n';
    run.mainOutput += approveMsg;
    io.to(runId).emit('run:output', { stream: 'main', data: approveMsg });

    try {
      await executeScript(run);
    } catch (err) {
      run.status = 'error';
      io.to(run.id).emit('run:error', { error: err.message });
      io.to(run.id).emit('run:status', { status: 'error' });
    }
  });

  // User rejects the script → regenerate with feedback
  socket.on('run:reject-script', async (data) => {
    const { runId, feedback } = data;
    const run = activeRuns.get(runId);
    if (!run) return;
    if (run.status !== 'script-review') return;

    const rejectMsg = `[Script changes requested: ${feedback}]\n[Regenerating script...]\n`;
    run.mainOutput += rejectMsg;
    io.to(runId).emit('run:output', { stream: 'main', data: rejectMsg });

    // Store the feedback and previous script for context
    run._scriptFeedback = feedback;
    run._previousScript = run.scriptContent;

    try {
      await runGenerateStage(run, feedback);
      if (run.status !== 'stopped') {
        run.status = 'script-review';
        io.to(runId).emit('run:status', { status: 'script-review' });
        const reviewMsg = '[Script regenerated — waiting for review before execution]\n';
        run.mainOutput += reviewMsg;
        io.to(runId).emit('run:output', { stream: 'main', data: reviewMsg });
      }
    } catch (err) {
      run.status = 'error';
      io.to(run.id).emit('run:error', { error: err.message });
      io.to(run.id).emit('run:status', { status: 'error' });
    }
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

// ---------------------------------------------------------------------------
// Plan process — uses --resume approach for back-and-forth planning
// (--chat is not a valid qodo flag; we use one-shot --ci calls and --resume)
// ---------------------------------------------------------------------------
function buildPlanPrompt(run) {
  const templatePath = path.join(__dirname, '..', 'template.sh');
  const guidePath = path.join(__dirname, '..', 'GUIDE.md');
  const template = fs.readFileSync(templatePath, 'utf-8');
  const guide = fs.readFileSync(guidePath, 'utf-8');

  return `You are planning a multi-agent orchestration script for a coding task.

You have a GUIDE that explains how to structure agent team scripts, and a TEMPLATE that shows the bash script format.

Analyze the user's task and produce a detailed PLAN that covers:

1. **Phase breakdown** — What phases are needed, in what order. Which can run in parallel (disjoint file sets) vs sequential (dependencies).
2. **Model assignment** — For each phase, whether to use Opus (complex reasoning) or Sonnet (mechanical edits). Justify each choice.
3. **File scope** — For each phase, list the specific files/directories it will touch. Verify zero overlap for parallel phases.
4. **Skip checks** — For each phase, what artifact to check to determine if it's already done.
5. **Brief contents** — What shared context all agents need (key decisions, schemas, constraints, what NOT to change).
6. **Risk assessment** — Any potential issues, ordering dependencies, or tricky parts.

After producing the plan, the user may ask you to revise it. Continue the conversation until they are satisfied. When they say they approve, output the final plan.

GUIDE:
${guide}

TEMPLATE (for reference — you're planning, not filling this yet):
${template}

USER'S TASK:
${run.prompt}

PROJECT PATH: ${run.projectPath}

Produce a clear, structured plan. Use markdown formatting.`;
}

function startPlanProcess(run) {
  const planPrompt = buildPlanPrompt(run);

  const msg = '[Stage 1/3: Planning — starting planner...]\n';
  run.mainOutput += msg;
  io.to(run.id).emit('run:output', { stream: 'main', data: msg });

  // One-shot --ci call for the initial plan; capture session ID for --resume follow-ups
  const qodoArgs = [
    '--ci', '-y',
    '--permissions=rwx',
    '--plan',
    `--model=${run.planModel}`,
    `--dir=${run.projectPath}`,
    planPrompt,
  ];

  _spawnPlanCall(run, qodoArgs);
}

function resumePlanProcess(run, userMessage) {
  if (!run.planSessionId) {
    io.to(run.id).emit('run:error', { error: 'No plan session to resume — cannot send follow-up' });
    return;
  }

  // Record user message
  run.planConversation.push({ role: 'user', content: userMessage });
  io.to(run.id).emit('run:plan-conversation', { conversation: run.planConversation });

  // Update status
  run.status = 'planning';
  io.to(run.id).emit('run:status', { status: 'planning' });

  const logMsg = `[User → Planner]: ${userMessage}\n`;
  run.mainOutput += logMsg;
  io.to(run.id).emit('run:output', { stream: 'main', data: logMsg });

  const qodoArgs = [
    '--ci', '-y',
    '--permissions=rwx',
    '--plan',
    `--model=${run.planModel}`,
    `--dir=${run.projectPath}`,
    `--resume=${run.planSessionId}`,
    userMessage,
  ];

  _spawnPlanCall(run, qodoArgs);
}

function _spawnPlanCall(run, qodoArgs) {
  const proc = spawn('qodo', qodoArgs, {
    cwd: run.projectPath,
    env: { ...process.env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  run.planProcess = proc;
  run._planCurrentResponse = '';

  let stderrContent = '';

  proc.stdout.on('data', (data) => {
    const text = data.toString();
    run._planCurrentResponse += text;

    // Stream to frontend in real-time
    io.to(run.id).emit('run:plan-stream', { data: text });
  });

  proc.stderr.on('data', (data) => {
    const text = data.toString();
    stderrContent += text;
    // stderr may contain session info, progress indicators, etc.
    run.mainOutput += text;
    io.to(run.id).emit('run:output', { stream: 'main', data: text });
  });

  proc.on('close', (code) => {
    run.planProcess = null;

    // Try to capture/update session ID from stderr for --resume
    const sessionMatch = stderrContent.match(/session[_\s]*(?:id)?[:\s]*([a-f0-9-]+)/i);
    if (sessionMatch) {
      run.planSessionId = sessionMatch[1];
    }

    // Record the agent response
    const response = run._planCurrentResponse.trim();
    if (response) {
      run.planConversation.push({ role: 'agent', content: response });
      run.planOutput = response; // latest plan is always the last agent response
      io.to(run.id).emit('run:plan-conversation', { conversation: run.planConversation });

      // Save to disk
      fs.writeFileSync(path.join(run.logDir, 'plan.md'), run.planOutput);
    }

    run._planCurrentResponse = '';

    if (run.status === 'stopped') return;

    // Move to plan-review so user can approve or send follow-up
    run.status = 'plan-review';
    io.to(run.id).emit('run:status', { status: 'plan-review' });

    const doneMsg = code === 0
      ? `[Planner response complete — review the plan]\n`
      : `[Plan process exited (code ${code}) — you can still approve the plan or start a new run]\n`;
    run.mainOutput += doneMsg;
    io.to(run.id).emit('run:output', { stream: 'main', data: doneMsg });
  });

  proc.on('error', (err) => {
    run.planProcess = null;
    run.status = 'error';
    io.to(run.id).emit('run:error', { error: `Failed to start planner: ${err.message}` });
    io.to(run.id).emit('run:status', { status: 'error' });
  });
}

// ---------------------------------------------------------------------------
// Stage 2: Generate — uses the plan to fill the template into a script
// ---------------------------------------------------------------------------
async function runGenerateStage(run, scriptFeedback) {
  run.status = 'generating';
  io.to(run.id).emit('run:status', { status: 'generating' });

  const templatePath = path.join(__dirname, '..', 'template.sh');
  const guidePath = path.join(__dirname, '..', 'GUIDE.md');
  const template = fs.readFileSync(templatePath, 'utf-8');
  const guide = fs.readFileSync(guidePath, 'utf-8');

  // Build the full plan context: if there was a multi-round conversation,
  // include it so the generator understands the evolution and final decisions.
  let planContext;
  if (run.planConversation.length > 1) {
    // Multi-round: include the full conversation so the generator sees
    // what was discussed, what was changed, and the final approved plan.
    const conversationText = run.planConversation.map(msg => {
      const role = msg.role === 'user' ? 'USER' : 'PLANNER';
      return `[${role}]:\n${msg.content}`;
    }).join('\n\n---\n\n');
    planContext = `PLAN CONVERSATION (multiple rounds of refinement — the FINAL message from the planner is the approved plan):\n\n${conversationText}\n\nFINAL APPROVED PLAN:\n${run.planOutput}`;
  } else {
    planContext = `PLAN:\n${run.planOutput}`;
  }

  // If there's feedback from a previous script review, include it
  let feedbackContext = '';
  if (scriptFeedback && run._previousScript) {
    feedbackContext = `

IMPORTANT — SCRIPT REVISION REQUESTED:
The user reviewed the previously generated script and requested changes:
"${scriptFeedback}"

The previous script that needs to be revised is provided below. Apply the requested changes while keeping everything else intact.

PREVIOUS SCRIPT:
${run._previousScript}

END OF PREVIOUS SCRIPT.
`;
  }

  const generatePrompt = `You are a script generator. You have a plan, a guide, and a bash template.

Your job: Using the PLAN below, produce a COMPLETE, RUNNABLE bash script based on the template. Fill in ALL {{PLACEHOLDER}} values. Remove all AGENT: comments. The script must be ready to execute with no manual editing.

CRITICAL RULES:
1. The script MUST be non-interactive. Replace ALL \`read -rp\` calls with automatic continuation. In run_phase, on failure just log and continue. In wait_all, on failure just log and continue. Remove checkpoint() read prompts — just log the message. Remove the phase plan "Press Enter" prompt.
2. Set PROJ="${run.projectPath}"
3. Set LOG="${run.logDir}"
4. For parallel phases, use launch_bg/wait_all (NOT tmux). Remove all tmux code entirely.
5. Each phase's log file must go into the LOG directory with descriptive names.
6. Output ONLY the bash script. No markdown fences, no explanation. Just the raw script starting with #!/bin/bash.
7. The OPUS and SONNET variables should use the models specified in the plan. Keep the --ci -y --permissions=rwx flags.

${planContext}

GUIDE:
${guide}

TEMPLATE:
${template}

USER'S ORIGINAL TASK:
${run.prompt}

PROJECT PATH: ${run.projectPath}

${feedbackContext}
Generate the complete bash script now. Output ONLY the script, nothing else.`;

  return new Promise((resolve, reject) => {
    const msg = '[Stage 2/3: Generating script from plan...]\n';
    run.mainOutput += msg;
    io.to(run.id).emit('run:output', { stream: 'main', data: msg });

    const qodoArgs = [
      '--ci', '-y', '--permissions=rwx',
      `--model=${run.generateModel}`,
      `--dir=${run.projectPath}`,
      generatePrompt,
    ];

    const proc = spawn('qodo', qodoArgs, {
      cwd: run.projectPath, env: { ...process.env },
    });

    run.genProcess = proc;
    let scriptContent = '';
    let stderrContent = '';

    proc.stdout.on('data', (data) => {
      const text = data.toString();
      scriptContent += text;
      io.to(run.id).emit('run:generation', { data: text });
    });

    proc.stderr.on('data', (data) => {
      stderrContent += data.toString();
    });

    proc.on('close', (code) => {
      run.genProcess = null;
      if (run.status === 'stopped') { resolve(); return; }
      if (code !== 0) {
        reject(new Error(`Script generation failed (exit ${code}): ${stderrContent}`));
        return;
      }

      // Try to capture session ID for resume
      const sessionMatch = stderrContent.match(/session[_\s]*(?:id)?[:\s]*([a-f0-9-]+)/i);
      if (sessionMatch) run.sessionId = sessionMatch[1];

      let cleaned = scriptContent.trim();
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:bash|sh)?\n?/, '').replace(/\n?```$/, '');
      }
      if (!cleaned.startsWith('#!/')) {
        cleaned = '#!/bin/bash\n' + cleaned;
      }

      fs.writeFileSync(run.scriptPath, cleaned, { mode: 0o755 });
      run.scriptContent = cleaned;

      const doneMsg = `[Script generated: ${run.scriptPath}]\n[Script length: ${cleaned.length} chars]\n\n`;
      run.mainOutput += doneMsg;
      io.to(run.id).emit('run:output', { stream: 'main', data: doneMsg });
      io.to(run.id).emit('run:script', { content: cleaned });
      resolve();
    });

    proc.on('error', (err) => {
      run.genProcess = null;
      reject(new Error(`Failed to spawn qodo for generation: ${err.message}`));
    });
  });
}

// ---------------------------------------------------------------------------
// Stage 3: Execute
// ---------------------------------------------------------------------------
async function executeScript(run) {
  return new Promise((resolve, reject) => {
    run.status = 'running';
    io.to(run.id).emit('run:status', { status: 'running' });

    const msg = '[Stage 3/3: Executing script...]\n\n';
    run.mainOutput += msg;
    io.to(run.id).emit('run:output', { stream: 'main', data: msg });

    const proc = spawn('bash', [run.scriptPath], {
      cwd: run.projectPath,
      env: { ...process.env, INTERACTIVE: '0', CHECKPOINTS: '0', FAIL_FAST: '0' },
    });

    run.process = proc;
    setupLogWatcher(run);

    proc.stdout.on('data', (data) => {
      const text = data.toString();
      run.mainOutput += text;
      io.to(run.id).emit('run:output', { stream: 'main', data: text });
      parsePhaseInfo(run, text);
    });

    proc.stderr.on('data', (data) => {
      const text = data.toString();
      run.mainOutput += text;
      io.to(run.id).emit('run:output', { stream: 'main', data: text });
    });

    proc.on('close', (code) => {
      run.process = null;
      run.status = code === 0 ? 'completed' : 'failed';
      io.to(run.id).emit('run:status', { status: run.status, exitCode: code });
      if (run.watcher) run.watcher.close();
      const endMsg = `\n[Script ${run.status} with exit code ${code}]\n`;
      run.mainOutput += endMsg;
      io.to(run.id).emit('run:output', { stream: 'main', data: endMsg });
      resolve();
    });

    proc.on('error', (err) => {
      run.process = null;
      run.status = 'error';
      io.to(run.id).emit('run:error', { error: err.message });
      reject(err);
    });
  });
}

// ---------------------------------------------------------------------------
// Log file watcher
// ---------------------------------------------------------------------------
function setupLogWatcher(run) {
  const logDir = run.logDir;
  const tailedFiles = new Map();

  const watcher = chokidar.watch(logDir, {
    ignored: /(^|[\/\\])\../,
    persistent: true, ignoreInitial: false,
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
  });

  watcher.on('add', (filePath) => {
    if (!filePath.endsWith('.log')) return;
    const basename = path.basename(filePath, '.log');
    const phaseId = basename;
    const label = basename.replace(/_/g, ' ').replace(/^phase\d+\s*/, 'Phase ');
    run.phases[phaseId] = { label: label || phaseId, status: 'running', output: '', logFile: filePath };
    io.to(run.id).emit('run:phase', { phaseId, label: run.phases[phaseId].label, status: 'running', output: '' });
    tailedFiles.set(filePath, { offset: 0, phaseId });
  });

  const pollInterval = setInterval(() => {
    for (const [filePath, meta] of tailedFiles) {
      try {
        const stat = fs.statSync(filePath);
        if (stat.size > meta.offset) {
          const fd = fs.openSync(filePath, 'r');
          const buf = Buffer.alloc(stat.size - meta.offset);
          fs.readSync(fd, buf, 0, buf.length, meta.offset);
          fs.closeSync(fd);
          const newData = buf.toString('utf-8');
          meta.offset = stat.size;
          if (run.phases[meta.phaseId]) run.phases[meta.phaseId].output += newData;
          io.to(run.id).emit('run:phase-output', { phaseId: meta.phaseId, data: newData });
        }
      } catch (e) { /* file may be deleted */ }
    }
  }, 500);

  watcher.on('close', () => clearInterval(pollInterval));
  run.watcher = watcher;
  run._pollInterval = pollInterval;
}

// ---------------------------------------------------------------------------
// Parse phase info from main output
// ---------------------------------------------------------------------------
function parsePhaseInfo(run, text) {
  const phaseStartRegex = /PHASE\s+(\d+|N)\s*\[([^\]]+)\]:\s*(.+)/g;
  let match;
  while ((match = phaseStartRegex.exec(text)) !== null) {
    const [, phaseNum, model, label] = match;
    const phaseId = `phase${phaseNum}`;
    if (!run.phases[phaseId]) {
      run.phases[phaseId] = { label: `Phase ${phaseNum}: ${label.trim()}`, model, status: 'running', output: '' };
    } else {
      run.phases[phaseId].label = `Phase ${phaseNum}: ${label.trim()}`;
      run.phases[phaseId].model = model;
    }
    io.to(run.id).emit('run:phase', { phaseId, label: run.phases[phaseId].label, model, status: 'running' });
  }

  if (/✅/.test(text)) {
    for (const [phaseId, phase] of Object.entries(run.phases)) {
      if (phase.status === 'running' && (text.includes(phase.label) || text.includes(phaseId))) {
        phase.status = 'completed';
        io.to(run.id).emit('run:phase', { phaseId, ...phase });
      }
    }
  }
  if (/❌/.test(text)) {
    for (const [phaseId, phase] of Object.entries(run.phases)) {
      if (phase.status === 'running' && (text.includes(phase.label) || text.includes(phaseId))) {
        phase.status = 'failed';
        io.to(run.id).emit('run:phase', { phaseId, ...phase });
      }
    }
  }
  const skipRegex = /⏭️\s*SKIP\s*(.*?)—/g;
  while ((match = skipRegex.exec(text)) !== null) {
    const skipLabel = match[1].trim();
    for (const [phaseId, phase] of Object.entries(run.phases)) {
      if (phase.label && phase.label.includes(skipLabel)) {
        phase.status = 'skipped';
        io.to(run.id).emit('run:phase', { phaseId, ...phase });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------
const PORT = process.env.PORT || 3847;
server.listen(PORT, () => {
  console.log(`\n  🚀 Qodo Agent Team GUI running at http://localhost:${PORT}\n`);
});
