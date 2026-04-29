const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const chokidar = require('chokidar');
const treeKill = require('tree-kill');

// ---------------------------------------------------------------------------
// Platform detection
// ---------------------------------------------------------------------------
const isWindows = process.platform === 'win32';
const homeDir = os.homedir();
const tmpDir = os.tmpdir();

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

app.get('/api/platform', (req, res) => res.json({
  platform: process.platform,
  isWindows,
  homeDir,
  tmpDir,
  pathSep: path.sep,
}));

// Enumerate accessible drive letters on Windows (A: through Z:).
function listWindowsDrives() {
  const dirs = [];
  for (let c = 65; c <= 90; c++) {
    const letter = String.fromCharCode(c);
    const drivePath = `${letter}:\\`;
    try {
      fs.accessSync(drivePath);
      dirs.push({ name: `${letter}:\\`, path: drivePath });
    } catch { /* drive not present */ }
  }
  return dirs;
}

app.get('/api/browse', (req, res) => {
  // Special sentinel — list available drive letters (Windows only).
  // The frontend can request this when the user wants to switch drives.
  if (isWindows && (req.query.path === '__drives__' || req.query.listDrives === '1')) {
    return res.json({ current: '__drives__', parent: '', dirs: listWindowsDrives() });
  }

  const dirPath = req.query.path || homeDir || (isWindows ? 'C:\\' : '/');
  try {
    const resolved = path.resolve(dirPath);
    const entries = fs.readdirSync(resolved, { withFileTypes: true });
    const dirs = entries
      .filter(e => e.isDirectory() && !e.name.startsWith('.'))
      .map(e => ({ name: e.name, path: path.join(resolved, e.name) }))
      .sort((a, b) => a.name.localeCompare(b.name));

    // On Windows, the parent of a drive root (e.g. `C:\`) is itself —
    // surface our `__drives__` sentinel so the user can switch drives
    // instead of getting stuck in a loop pressing "up".
    let parent = path.dirname(resolved);
    if (isWindows && parent === resolved) {
      parent = '__drives__';
    } else if (!isWindows && parent === resolved) {
      parent = '';
    }

    res.json({ current: resolved, parent, dirs });
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

// Scan temp directory for previous qodo-team run directories
app.get('/api/previous-runs', (req, res) => {
  try {
    const entries = fs.readdirSync(tmpDir, { withFileTypes: true });
    const runs = [];

    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith('qodo-team-')) continue;

      const runId = entry.name.replace('qodo-team-', '');
      const dirPath = path.join(tmpDir, entry.name);

      // Check what files exist
      let files;
      try {
        files = fs.readdirSync(dirPath);
      } catch { continue; }

      const hasScript = files.includes('run.sh') || files.includes('run.ps1');
      const hasPlan = files.includes('plan.md');
      const logFiles = files.filter(f => f.endsWith('.log'));

      // Get directory stats for timestamp
      let stat;
      try {
        stat = fs.statSync(dirPath);
      } catch { continue; }

      // Try to extract project path and prompt context from the script
      let projectPath = '';
      let scriptSize = 0;
      if (hasScript) {
        try {
          const scriptFile = files.includes('run.ps1') ? 'run.ps1' : 'run.sh';
          const scriptPath = path.join(dirPath, scriptFile);
          const scriptStat = fs.statSync(scriptPath);
          scriptSize = scriptStat.size;
          const scriptHead = fs.readFileSync(scriptPath, 'utf-8').substring(0, 2000);
          // Match bash PROJ="..." or PowerShell $PROJ = "..."
          const projMatch = scriptHead.match(/^(?:\$?PROJ)\s*=\s*"([^"]+)"/m);
          if (projMatch) projectPath = projMatch[1];
        } catch { /* ignore */ }
      }

      // Try to get a brief summary from plan.md
      let planSummary = '';
      if (hasPlan) {
        try {
          const planContent = fs.readFileSync(path.join(dirPath, 'plan.md'), 'utf-8');
          // Get first heading or first non-empty line
          const headingMatch = planContent.match(/^#\s+(.+)/m);
          if (headingMatch) {
            planSummary = headingMatch[1].substring(0, 120);
          } else {
            const firstLine = planContent.split('\n').find(l => l.trim().length > 0);
            if (firstLine) planSummary = firstLine.trim().substring(0, 120);
          }
        } catch { /* ignore */ }
      }

      // Check if this run is already active in memory
      const isActive = activeRuns.has(runId);

      runs.push({
        id: runId,
        dirPath,
        hasScript,
        hasPlan,
        logFiles,
        projectPath,
        planSummary,
        scriptSize,
        isActive,
        modifiedAt: stat.mtime.toISOString(),
        createdAt: stat.birthtime.toISOString(),
      });
    }

    // Sort by most recent first
    runs.sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());

    res.json(runs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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

app.delete('/api/previous-runs/:id', (req, res) => {
  const runId = req.params.id;
  const dirPath = path.join(tmpDir, `qodo-team-${runId}`);

  // Don't allow deleting active runs
  const activeRun = activeRuns.get(runId);
  if (activeRun) {
    const proc = activeRun.process || activeRun.planProcess || activeRun.genProcess;
    if (proc && proc.pid) {
      return res.status(400).json({ error: 'Cannot delete an actively running run. Stop it first.' });
    }
    // Clean up from active runs map
    if (activeRun.watcher) activeRun.watcher.close();
    if (activeRun._pollInterval) clearInterval(activeRun._pollInterval);
    activeRuns.delete(runId);
  }

  try {
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
  saveRunSummary(run, null);
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
    shell: isWindows,
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
    saveRunSummary(run, code);
  });

  res.json({ ok: true });
});

// One-shot follow-up that fires a fresh `qodo --ci` (no session resume) with
// the work context — original task, plan, script, phase outcomes, and a tail
// of the execution output — embedded in the prompt. Used by the Summary page.
function buildFollowUpContext(run) {
  const phaseLines = Object.entries(run.phases || {}).map(([phaseId, phase]) => {
    const label = phase.label || phaseId;
    const summary = phase.summary
      ? `\n  Summary: ${String(phase.summary).replace(/\n/g, '\n  ')}`
      : '';
    return `- ${label}: ${phase.status}${summary}`;
  });

  const phasesSection = phaseLines.length > 0
    ? `\n\nPhase outcomes:\n${phaseLines.join('\n')}`
    : '';

  const truncate = (s, n) => (s && s.length > n ? `${s.slice(0, n)}\n...[truncated, ${s.length - n} more chars]` : s || '');

  const planExcerpt = run.planOutput
    ? `\n\n<plan>\n${truncate(run.planOutput, 8000)}\n</plan>`
    : '';

  const scriptExcerpt = run.scriptContent
    ? `\n\n<script path="${run.scriptPath}">\n${truncate(run.scriptContent, 6000)}\n</script>`
    : '';

  const outputTail = run.mainOutput && run.mainOutput.length > 0
    ? `\n\n<execution-output-tail>\n${run.mainOutput.slice(-4000)}\n</execution-output-tail>`
    : '';

  return `<work-context>
Original task: ${run.prompt || '(none)'}
Final run status: ${run.status}
Project path: ${run.projectPath}
Log directory: ${run.logDir}${phasesSection}${planExcerpt}${scriptExcerpt}${outputTail}
</work-context>`;
}

app.post('/api/runs/:id/follow-up', (req, res) => {
  const run = activeRuns.get(req.params.id);
  if (!run) return res.status(404).json({ error: 'Run not found' });

  const { message, model } = req.body || {};
  if (!message || !String(message).trim()) {
    return res.status(400).json({ error: 'Message required' });
  }
  if (run.process) {
    return res.status(409).json({ error: 'A process is already running for this run' });
  }

  const followUpModel = model || run.generateModel || 'anthropic/claude-sonnet-4-6';
  const contextBlock = buildFollowUpContext(run);
  const fullPrompt = `${contextBlock}\n\nFollow-up question:\n${String(message).trim()}`;

  const qodoArgs = [
    '--ci', '-y', '--permissions=rwx',
    `--model=${followUpModel}`,
    fullPrompt,
  ];

  const proc = spawn('qodo', qodoArgs, {
    cwd: run.projectPath,
    env: { ...process.env },
    shell: isWindows,
  });

  run.process = proc;
  run.status = 'chatting';
  io.to(run.id).emit('run:status', { status: 'chatting' });

  const header = `\n\n━━━ Follow-up (${followUpModel}) ━━━\n> ${String(message).trim()}\n\n`;
  run.mainOutput += header;
  io.to(run.id).emit('run:output', { stream: 'main', data: header });

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
  proc.on('error', (err) => {
    const text = `\n[follow-up spawn error: ${err.message}]\n`;
    run.mainOutput += text;
    io.to(run.id).emit('run:output', { stream: 'main', data: text });
    run.status = 'failed';
    run.process = null;
    io.to(run.id).emit('run:status', { status: run.status });
    saveRunSummary(run, null);
  });
  proc.on('close', (code) => {
    run.status = code === 0 ? 'completed' : 'failed';
    run.process = null;
    io.to(run.id).emit('run:status', { status: run.status });
    saveRunSummary(run, code);
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
    const { prompt, projectPath, contextFolders, planModel, generateModel, skipPlan } = data;
    const runId = uuidv4().substring(0, 8);
    const logDir = path.join(tmpDir, `qodo-team-${runId}`);
    const scriptExt = isWindows ? 'run.ps1' : 'run.sh';
    const scriptPath = path.join(logDir, scriptExt);

    fs.mkdirSync(logDir, { recursive: true });

    const run = {
      id: runId,
      prompt,
      projectPath,
      contextFolders: Array.isArray(contextFolders) ? contextFolders : [],
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

  // User asks to regenerate the script with no feedback (e.g. previous output
  // was truncated / structurally broken, or execution failed and the user
  // wants a fresh script attempt). Same plan, fresh generation.
  socket.on('run:regenerate-script', async (data) => {
    const { runId } = data;
    console.log(`[run:regenerate-script] received for run ${runId}`);
    const run = activeRuns.get(runId);
    if (!run) {
      const msg = `[Regenerate failed: run ${runId} is not active. Reload the run from History first.]\n`;
      socket.emit('run:output', { stream: 'main', data: msg });
      socket.emit('run:error', { error: `Run ${runId} not active in memory` });
      return;
    }
    if (!run.planOutput) {
      const msg = `[Regenerate failed: this run has no saved plan to regenerate from.]\n`;
      run.mainOutput += msg;
      io.to(runId).emit('run:output', { stream: 'main', data: msg });
      return;
    }
    const allowedStatuses = ['script-review', 'failed', 'stopped', 'error', 'completed'];
    if (!allowedStatuses.includes(run.status)) {
      const msg = `[Regenerate not allowed in status "${run.status}". Allowed: ${allowedStatuses.join(', ')}.]\n`;
      run.mainOutput += msg;
      io.to(runId).emit('run:output', { stream: 'main', data: msg });
      return;
    }

    // If a previous execution is in flight, stop it cleanly.
    if (run.process) {
      try { treeKill(run.process.pid); } catch (_) {}
      run.process = null;
    }
    if (run.watcher) {
      try { run.watcher.close(); } catch (_) {}
      run.watcher = null;
    }
    if (run._pollInterval) {
      clearInterval(run._pollInterval);
      run._pollInterval = null;
    }

    // Reset phase state — a regenerated script will produce a new run.
    run.phases = {};

    const msg = '[Regenerating script with the same plan...]\n';
    run.mainOutput += msg;
    io.to(runId).emit('run:output', { stream: 'main', data: msg });

    // Don't pass feedback — this is a "same plan, retry" path.
    // Don't include the previous script as context either.
    run._previousScript = null;
    run._scriptFeedback = null;

    try {
      await runGenerateStage(run, null);
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

  // Restore a previous run from disk (load script + plan, optionally execute)
  socket.on('run:restore', async (data) => {
    const { runId, execute } = data;
    const logDir = path.join(tmpDir, `qodo-team-${runId}`);
    const scriptExt = isWindows ? 'run.ps1' : 'run.sh';
    const scriptPath = path.join(logDir, scriptExt);

    // Check if the directory exists
    if (!fs.existsSync(logDir)) {
      socket.emit('run:error', { error: `Run directory not found: ${logDir}` });
      return;
    }

    // If already active, just join and send state
    if (activeRuns.has(runId)) {
      socket.join(runId);
      socket.emit('run:created', { runId });
      return;
    }

    // Read script from disk
    let scriptContent = '';
    let projectPath = '';
    if (fs.existsSync(scriptPath)) {
      scriptContent = fs.readFileSync(scriptPath, 'utf-8');
      // Match bash PROJ="..." or PowerShell $PROJ = "..."
      const projMatch = scriptContent.match(/^(?:\$?PROJ)\s*=\s*"([^"]+)"/m);
      if (projMatch) projectPath = projMatch[1];
    }

    // Read plan from disk
    let planOutput = '';
    const planPath = path.join(logDir, 'plan.md');
    if (fs.existsSync(planPath)) {
      planOutput = fs.readFileSync(planPath, 'utf-8');
    }

    // Read saved terminal-state summary, if any
    let summaryData = null;
    const summaryPath = path.join(logDir, 'summary.json');
    if (fs.existsSync(summaryPath)) {
      try {
        summaryData = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
      } catch (err) {
        console.error(`[run:restore] failed to parse summary.json for ${runId}:`, err.message);
      }
    }

    // Read the saved main output (from a finished run), if any
    let savedMainOutput = '';
    const mainLogPath = path.join(logDir, 'main.log');
    if (fs.existsSync(mainLogPath)) {
      try {
        savedMainOutput = fs.readFileSync(mainLogPath, 'utf-8');
      } catch (err) {
        console.error(`[run:restore] failed to read main.log for ${runId}:`, err.message);
      }
    }

    // Restoration mode:
    //   - If the user clicked Execute we always start fresh (re-run the script).
    //   - If the user clicked Review and a saved summary exists, restore the
    //     terminal state so the SummaryPage can be re-displayed.
    const hasTerminalSummary = !!summaryData &&
      ['completed', 'failed', 'stopped', 'error'].includes(summaryData.status);
    const restoreTerminal = !execute && hasTerminalSummary;

    const banner = (() => {
      let s = `[Restored previous run: ${runId}]\n[Directory: ${logDir}]\n`;
      if (projectPath || summaryData?.projectPath) {
        s += `[Project: ${summaryData?.projectPath || projectPath}]\n`;
      }
      if (scriptContent) {
        s += `[Script loaded: ${scriptPath} (${scriptContent.length} chars)]\n`;
      }
      if (planOutput) {
        s += `[Plan loaded: ${planPath}]\n`;
      }
      if (summaryData) {
        s += `[Summary loaded: status=${summaryData.status}, phases=${Object.keys(summaryData.phases || {}).length}]\n`;
      }
      return s + '\n';
    })();

    // Compose mainOutput: if we have a saved main log and we're restoring the
    // terminal state, surface the original output preceded by a small banner.
    const composedMainOutput = restoreTerminal && savedMainOutput
      ? `${banner}${savedMainOutput}`
      : banner;

    // Rehydrate phases from the saved summary so the SummaryPage and tabs work.
    const restoredPhases = restoreTerminal && summaryData?.phases
      ? Object.fromEntries(
          Object.entries(summaryData.phases).map(([id, p]) => [id, {
            label: p.label || id,
            status: p.status || 'completed',
            model: p.model || undefined,
            output: '',
            summary: p.summary || '',
          }])
        )
      : {};

    const fallbackStatus = scriptContent ? 'script-review' : (planOutput ? 'plan-review' : 'error');

    // Create the run object in memory
    const run = {
      id: runId,
      prompt: summaryData?.prompt || '[Restored from previous run]',
      projectPath: summaryData?.projectPath || projectPath,
      contextFolders: Array.isArray(summaryData?.contextFolders) ? summaryData.contextFolders : [],
      logDir,
      scriptPath,
      planModel: summaryData?.planModel || 'anthropic/claude-sonnet-4-6',
      generateModel: summaryData?.generateModel || 'anthropic/claude-sonnet-4-6',
      status: restoreTerminal ? summaryData.status : fallbackStatus,
      createdAt: summaryData?.createdAt || new Date().toISOString(),
      mainOutput: composedMainOutput,
      planOutput,
      planConversation: planOutput ? [{ role: 'agent', content: planOutput }] : [],
      scriptContent,
      phases: restoredPhases,
      process: null,
      planProcess: null,
      genProcess: null,
      sessionId: summaryData?.sessionId || null,
      planSessionId: summaryData?.planSessionId || null,
      watcher: null,
      _planCurrentResponse: '',
    };

    activeRuns.set(runId, run);
    socket.join(runId);
    socket.emit('run:created', { runId });

    // If execute flag is set and we have a script, run it immediately
    if (execute && scriptContent) {
      run.mainOutput += '[Executing script...]\n\n';
      io.to(runId).emit('run:output', { stream: 'main', data: run.mainOutput });
      io.to(runId).emit('run:script', { content: scriptContent });

      try {
        await executeScript(run);
      } catch (err) {
        run.status = 'error';
        io.to(runId).emit('run:error', { error: err.message });
        io.to(runId).emit('run:status', { status: 'error' });
      }
    }
  });

  // User re-runs the script after failure (possibly after manual edits to run.sh)
  socket.on('run:rerun-script', async (data) => {
    const { runId } = data;
    const run = activeRuns.get(runId);
    if (!run) return;
    if (run.status !== 'failed' && run.status !== 'stopped' && run.status !== 'error') return;

    // Re-read the script from disk in case the user manually edited it
    try {
      if (fs.existsSync(run.scriptPath)) {
        const updatedScript = fs.readFileSync(run.scriptPath, 'utf-8');
        run.scriptContent = updatedScript;
        io.to(runId).emit('run:script', { content: updatedScript });
      }
    } catch (err) {
      // If we can't read the script, proceed with what we have
    }

    // Reset phase state for a fresh execution
    run.phases = {};

    // Close any existing watcher
    if (run.watcher) {
      run.watcher.close();
      run.watcher = null;
    }
    if (run._pollInterval) {
      clearInterval(run._pollInterval);
      run._pollInterval = null;
    }

    const rerunMsg = `\n${'━'.repeat(60)}\n[Re-running script: ${run.scriptPath}]\n${'━'.repeat(60)}\n\n`;
    run.mainOutput += rerunMsg;
    io.to(runId).emit('run:output', { stream: 'main', data: rerunMsg });

    try {
      await executeScript(run);
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
  const templateExt = isWindows ? 'template.ps1' : 'template.sh';
  const templatePath = path.join(__dirname, '..', templateExt);
  // Use the platform-matched GUIDE so the LLM sees the correct script syntax.
  // GUIDE_WINDOWS.md describes PowerShell helpers; GUIDE.md describes bash.
  const guideName = isWindows ? 'GUIDE_WINDOWS.md' : 'GUIDE.md';
  const guidePath = path.join(__dirname, '..', guideName);
  const template = fs.readFileSync(templatePath, 'utf-8');
  const guide = fs.readFileSync(guidePath, 'utf-8');

  const scriptType = isWindows ? 'PowerShell' : 'bash';
  return `You are planning a multi-agent orchestration script for a coding task.

You have a GUIDE that explains how to structure agent team scripts, and a TEMPLATE that shows the ${scriptType} script format.

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
${run.contextFolders && run.contextFolders.length > 0 ? `
CONTEXT FOLDERS (read-only reference — do NOT modify files in these folders, but agents can read them for context):
${run.contextFolders.map(f => '  - ' + f).join('\n')}

These context folders contain reference material, shared libraries, or related code that agents should be aware of when planning. Include instructions in the plan for agents to read relevant files from these folders when needed.
` : ''}
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
    shell: isWindows,
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

    // Record the agent response — strip ANSI codes from plan output
    // eslint-disable-next-line no-control-regex
    const response = run._planCurrentResponse.trim()
      .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
      .replace(/\x1b\][^\x07]*\x07/g, '')
      .replace(/\x1b\[[\?]?[0-9;]*[a-zA-Z]/g, '');
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
// Fix broken line continuations in generated bash scripts
// ---------------------------------------------------------------------------
// The qodo CLI (or the LLM) sometimes wraps long lines in ways that break
// Validate a generated script for the structural issues that indicate the
// model truncated, bailed out with prose, or skipped the phase body.
// Returns an array of human-readable issue strings (empty = OK).
function validateGeneratedScript(script, isWindows) {
  const issues = [];
  const len = script.length;

  if (isWindows) {
    if (!/\$ErrorActionPreference/m.test(script)) {
      issues.push('missing $ErrorActionPreference (PowerShell prelude)');
    }
    if (!/\bRun-Phase\b|\bLaunch-Bg\b/.test(script)) {
      issues.push('no Run-Phase or Launch-Bg calls — script has no phase execution');
    }
  } else {
    if (!/^#!\/bin\/(bash|sh)/m.test(script)) {
      issues.push('missing #!/bin/bash shebang');
    }
    if (!/\brun_phase\b|\blaunch_bg\b/.test(script)) {
      issues.push('no run_phase or launch_bg calls — script has no phase execution');
    }
  }

  if (len < 2000) {
    issues.push(`script is suspiciously short (${len} chars) — likely truncated`);
  }

  // Detect prose endings — the most common LLM bail-out failure mode.
  // We check the last non-empty 5 lines for English filler that doesn't
  // belong in a script body.
  const tail = script.split('\n').filter(l => l.trim()).slice(-5).join('\n');
  const prosePatterns = [
    /the full script is saved/i,
    /^[^#$]*\bto run it\b\s*:?\s*$/im,
    /^[^#$]*\bsaved at the path\b/im,
    /^[^#$]*\bhere'?s? the\b/im,
    /^[^#$]*\b\[script (?:continues|truncated)/im,
  ];
  for (const re of prosePatterns) {
    if (re.test(tail)) {
      issues.push('script ends with English prose — model bailed out before completing');
      break;
    }
  }

  return issues;
}

// bash syntax. This function repairs the most common patterns:
//   1. A line ending with a bare `\` where the *previous* line should have
//      had the `\` at its end (i.e. the backslash got pushed to a new line).
//   2. Comment lines that were split mid-sentence so the continuation is
//      not preceded by `#`, causing bash to try to execute it as a command.
//   3. Function call arguments split across lines without proper `\`
//      continuation (e.g. `func "arg1"\n"arg2" \`).
function fixBrokenLineContinuations(script) {
  const lines = script.split('\n');
  const fixed = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const nextLine = i + 1 < lines.length ? lines[i + 1] : null;

    // Pattern 1: A line that is ONLY a backslash (possibly with whitespace).
    // This means the previous line should have ended with ` \` and the
    // backslash was incorrectly placed on its own line.
    // Merge: append ` \` to the previous fixed line, skip this line.
    if (/^\s*\\$/.test(line) && fixed.length > 0) {
      // The previous line in `fixed` should get the trailing ` \`
      const prev = fixed[fixed.length - 1];
      if (!prev.trimEnd().endsWith('\\')) {
        fixed[fixed.length - 1] = prev.trimEnd() + ' \\';
      }
      i++;
      continue;
    }

    // Pattern 2: Current line is inside a `# ...` comment block but the
    // next line is NOT a comment and looks like a continuation of the
    // comment text (no leading #, not a valid bash statement start).
    // This catches things like:
    //   # rebuild-colour-system.sh — Rebuild component-library colour system to numeric
    //   notation
    // Fix: merge the next line into the current comment line.
    if (/^\s*#/.test(line) && nextLine !== null &&
        !/^\s*#/.test(nextLine) && !/^\s*$/.test(nextLine)) {
      // Check if the next line looks like a stray word continuation
      // (not a valid bash keyword/command start)
      const trimmedNext = nextLine.trim();
      const bashKeywords = /^(if|then|else|elif|fi|for|while|do|done|case|esac|function|return|exit|local|export|declare|set|echo|log|cat|grep|mkdir|command|read|\[|\[\[|&&|\|\||[A-Z_]+=|[a-z_]+=|\$|{|}|\)|#|$)/;
      if (!bashKeywords.test(trimmedNext) && /^[a-zA-Z]/.test(trimmedNext)) {
        fixed.push(line.trimEnd() + ' ' + trimmedNext);
        i += 2;
        continue;
      }
    }

    // Pattern 3: A function/command call where the arguments are split
    // across lines without `\`. Detect when a line ends with a quoted
    // string and the next line starts with another quoted string that
    // looks like it should be on the same line.
    // e.g.:
    //   run_phase "Phase 1: Do stuff"
    //   "$LOG/phase1.log" \
    // Fix: join them with a space.
    if (nextLine !== null && /^"/.test(line.trimStart()) === false) {
      const trimmedLine = line.trimEnd();
      const trimmedNext = nextLine.trimStart();
      if (/^"[^"]*"$/.test(trimmedLine.split(/\s+/).pop() || '') === false &&
          trimmedLine.endsWith('"') &&
          trimmedNext.startsWith('"') &&
          !trimmedLine.endsWith('\\')) {
        // This looks like a split argument list — join them
        fixed.push(trimmedLine + ' ' + nextLine.trimEnd());
        i += 2;
        continue;
      }
    }

    fixed.push(line);
    i++;
  }

  return fixed.join('\n');
}

// ---------------------------------------------------------------------------
// Extract bash script from raw qodo CLI output
// ---------------------------------------------------------------------------
// The qodo CLI in --ci mode outputs everything to stdout: initialization
// messages, ANSI escape codes, tool call results, thinking steps, and the
// actual script content. This function extracts just the bash script.
function extractBashScript(rawOutput) {
  // Step 1: Strip ANSI escape codes
  // eslint-disable-next-line no-control-regex
  const ansiStripped = rawOutput.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
                                .replace(/\x1b\][^\x07]*\x07/g, '')   // OSC sequences
                                .replace(/\x1b\[[\?]?[0-9;]*[a-zA-Z]/g, '');

  // Step 2: Try to find a bash script inside markdown code fences
  const fenceMatch = ansiStripped.match(/```(?:bash|sh|shell)?\s*\n(#!\/bin\/bash[\s\S]*?)\n```/);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }

  // Step 3: Try to find the script by looking for #!/bin/bash
  // The script should be the largest contiguous block starting with #!/bin/bash
  const shebangIndex = ansiStripped.lastIndexOf('#!/bin/bash');
  if (shebangIndex !== -1) {
    let scriptBlock = ansiStripped.substring(shebangIndex);

    // If there's trailing markdown fence, strip it
    const trailingFence = scriptBlock.indexOf('\n```');
    if (trailingFence !== -1) {
      scriptBlock = scriptBlock.substring(0, trailingFence);
    }

    // Clean up: remove any trailing agent chatter after the script ends.
    // A valid script typically ends with `done` or a log statement.
    // Look for patterns that indicate the script has ended and agent is talking:
    // - Lines that start with common agent output patterns after the script
    const agentChatterPatterns = [
      /\n(?:The script |I've |This script |Here's |Note:|---|\*\*)/,
      /\n(?:This will |Make sure |You can |To run )/,
    ];
    for (const pattern of agentChatterPatterns) {
      const chatterMatch = scriptBlock.match(pattern);
      if (chatterMatch && chatterMatch.index > scriptBlock.length * 0.5) {
        // Only trim if the chatter is in the latter half of the output
        scriptBlock = scriptBlock.substring(0, chatterMatch.index);
      }
    }

    return scriptBlock.trim();
  }

  // Step 4: Try to find it via the write_file tool output
  // qodo sometimes uses a write_file tool which shows the file content in a diff
  const writeFileMatch = ansiStripped.match(/\+#!\/bin\/bash\n([\s\S]*?)(?:\n`---|$)/);
  if (writeFileMatch) {
    // Reconstruct from diff lines (strip leading +)
    const diffContent = '#!/bin/bash\n' + writeFileMatch[1];
    const cleaned = diffContent.replace(/^\+/gm, '');
    return cleaned.trim();
  }

  // Step 5: Fallback — just clean up what we have
  let fallback = ansiStripped.trim();
  if (fallback.startsWith('```')) {
    fallback = fallback.replace(/^```(?:bash|sh)?\n?/, '').replace(/\n?```$/, '');
  }
  if (!fallback.startsWith('#!/')) {
    fallback = '#!/bin/bash\n' + fallback;
  }
  return fallback;
}

// ---------------------------------------------------------------------------
// Extract PowerShell script from raw qodo CLI output
// ---------------------------------------------------------------------------
function extractPowerShellScript(rawOutput) {
  // Step 1: Strip ANSI escape codes
  // eslint-disable-next-line no-control-regex
  const ansiStripped = rawOutput.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
                                .replace(/\x1b\][^\x07]*\x07/g, '')
                                .replace(/\x1b\[[\?]?[0-9;]*[a-zA-Z]/g, '');

  // Step 2: Try to find a PowerShell script inside markdown code fences
  const fenceMatch = ansiStripped.match(/```(?:powershell|ps1|pwsh)?\s*\n((?:\$ErrorActionPreference|# =====)[\s\S]*?)\n```/);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }

  // Step 3: Try to find the script by looking for $ErrorActionPreference or common PS patterns
  const psPatterns = ['$ErrorActionPreference', '# ============='];
  for (const pattern of psPatterns) {
    const idx = ansiStripped.lastIndexOf(pattern);
    if (idx !== -1) {
      let scriptBlock = ansiStripped.substring(idx);

      // If there's trailing markdown fence, strip it
      const trailingFence = scriptBlock.indexOf('\n```');
      if (trailingFence !== -1) {
        scriptBlock = scriptBlock.substring(0, trailingFence);
      }

      // Remove trailing agent chatter
      const agentChatterPatterns = [
        /\n(?:The script |I've |This script |Here's |Note:|---|\*\*)/,
        /\n(?:This will |Make sure |You can |To run )/,
      ];
      for (const cp of agentChatterPatterns) {
        const chatterMatch = scriptBlock.match(cp);
        if (chatterMatch && chatterMatch.index > scriptBlock.length * 0.5) {
          scriptBlock = scriptBlock.substring(0, chatterMatch.index);
        }
      }

      return scriptBlock.trim();
    }
  }

  // Step 4: Fallback
  let fallback = ansiStripped.trim();
  if (fallback.startsWith('```')) {
    fallback = fallback.replace(/^```(?:powershell|ps1)?\n?/, '').replace(/\n?```$/, '');
  }
  return fallback;
}

// ---------------------------------------------------------------------------
// Stage 2: Generate — uses the plan to fill the template into a script
// ---------------------------------------------------------------------------
async function runGenerateStage(run, scriptFeedback) {
  run.status = 'generating';
  io.to(run.id).emit('run:status', { status: 'generating' });

  const templateExt = isWindows ? 'template.ps1' : 'template.sh';
  const templatePath = path.join(__dirname, '..', templateExt);
  const guideName = isWindows ? 'GUIDE_WINDOWS.md' : 'GUIDE.md';
  const guidePath = path.join(__dirname, '..', guideName);
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

  const scriptType = isWindows ? 'PowerShell' : 'bash';
  const firstLine = isWindows ? '$ErrorActionPreference = "Continue"' : '#!/bin/bash';
  const endMarker = isWindows ? '# === END OF SCRIPT ===' : '# === END OF SCRIPT ===';
  const interactiveRule = isWindows
    ? 'The script MUST be non-interactive. Replace ALL Read-Host calls with automatic continuation. In Run-Phase, on failure just log and continue. In Wait-AllBg, on failure just log and continue. Remove Show-Checkpoint prompts — just log the message.'
    : 'The script MUST be non-interactive. Replace ALL `read -rp` calls with automatic continuation. In run_phase, on failure just log and continue. In wait_all, on failure just log and continue. Remove checkpoint() read prompts — just log the message.';
  const parallelRule = isWindows
    ? 'For parallel phases, use Launch-Bg/Wait-AllBg (PowerShell background jobs).'
    : 'For parallel phases, use launch_bg/wait_all (NOT tmux). Remove all tmux code entirely.';
  const phaseCallNames = isWindows ? 'Run-Phase / Launch-Bg' : 'run_phase / launch_bg';

  const generatePrompt = `You are a script transcriber. You receive a PLAN, a GUIDE, and a ${scriptType} TEMPLATE. Your job is to MECHANICALLY assemble the final, runnable ${scriptType} script by filling the template with the plan's contents.

This is a transcription task, not a generation task. Do not summarize. Do not describe what the script does. Do not write meta-commentary. Emit the actual script body, in full, as raw ${scriptType}.

═══════════════════════════════════════════════════════════════
INPUTS
═══════════════════════════════════════════════════════════════

${planContext}

GUIDE:
${guide}

TEMPLATE:
${template}

USER'S ORIGINAL TASK:
${run.prompt}

PROJECT PATH: ${run.projectPath}
${run.contextFolders && run.contextFolders.length > 0 ? `
CONTEXT FOLDERS (read-only reference — agents can read files from these folders for context but must NOT modify them):
${run.contextFolders.map(f => '  - ' + f).join('\n')}

IMPORTANT: In the generated script, include the context folder paths in the brief so all agents know about them. When agents need to reference patterns, types, or code from these folders, instruct them to read from these paths. Do NOT use --dir with context folders — only use --dir with the project path. Instead, mention context folders in each phase's TASK prompt where relevant.
` : ''}
${feedbackContext}
═══════════════════════════════════════════════════════════════
OUTPUT CONTRACT — read this carefully, your output is validated
═══════════════════════════════════════════════════════════════

CONTENT RULES:
1. ${interactiveRule} Remove the phase plan pause prompt.
2. Set ${isWindows ? '$PROJ' : 'PROJ'}="${run.projectPath}"
3. Set ${isWindows ? '$LOG' : 'LOG'}="${run.logDir}"
4. ${parallelRule}
5. Each phase's log file must go into the LOG directory with descriptive names (e.g. phase1_<short_name>.log).
6. The OPUS and SONNET variables must use the models specified in the plan, with --ci -y --permissions=rwx flags preserved.
7. Fill in ALL {{PLACEHOLDER}} values from the template. Remove ALL "AGENT:" comments.
8. The script MUST contain the helper functions from the template AND a concrete ${phaseCallNames} call for EVERY phase listed in the plan. A script with only the header/config and no phase execution is INVALID.

OUTPUT FORMAT (strict — any deviation breaks downstream parsing):
- Begin your output with this exact line as the first character: ${firstLine}
- End your output with this exact line as the very last line: ${endMarker}
- Between those two lines, output ONLY the ${scriptType} script. No markdown fences. No explanations. No "Here's the script" preamble. No "The script has been saved" epilogue.
- Do NOT write English prose anywhere in your output except inside ${scriptType} comments (lines starting with #) or inside string literals.

EXAMPLES OF FORBIDDEN OUTPUT (do not do any of these):
  ✗ Writing "Here is the complete script:" before ${firstLine}
  ✗ Writing "The full script is saved at the path above. To run it:" anywhere
  ✗ Wrapping output in \`\`\`bash ... \`\`\` fences
  ✗ Writing "[script continues...]" or any placeholder
  ✗ Stopping before all phases have ${phaseCallNames} calls
  ✗ Omitting the ${endMarker} marker

Self-check before you stop emitting:
  1. Did you write ${firstLine} as the first line? If not, restart.
  2. Did you write a ${phaseCallNames} call for every phase named in the plan? If not, keep going.
  3. Did you write ${endMarker} as the last line? If not, write it now.

Emit the script now. Start immediately with ${firstLine}.`;

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
      shell: isWindows,
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

      // The qodo CLI outputs everything to stdout: init messages, ANSI codes,
      // tool calls, thinking, AND the actual script. We need to extract just
      // the script from all that noise.
      let cleaned;
      if (isWindows) {
        cleaned = extractPowerShellScript(scriptContent);
      } else {
        cleaned = extractBashScript(scriptContent);
        // Fix common line-wrapping issues that break bash syntax
        cleaned = fixBrokenLineContinuations(cleaned);
      }

      // Strip the END OF SCRIPT marker (we only require it for validation)
      cleaned = cleaned.replace(/\n*#\s*===\s*END OF SCRIPT\s*===\s*$/m, '').trimEnd() + '\n';

      // Validate the generated script. If broken (truncated, prose-ended,
      // missing phase calls), still write the file so the user can inspect it,
      // but emit a warning so they know to regenerate rather than execute.
      const issues = validateGeneratedScript(cleaned, isWindows);

      fs.writeFileSync(run.scriptPath, cleaned, { mode: 0o755 });
      run.scriptContent = cleaned;
      run.scriptValidationIssues = issues;

      if (issues.length > 0) {
        const warnMsg = `\n⚠️  Generated script appears broken:\n${issues.map(i => '  • ' + i).join('\n')}\n\nClick "Regenerate" to retry, or inspect the script in the Raw view.\n\n`;
        run.mainOutput += warnMsg;
        io.to(run.id).emit('run:output', { stream: 'main', data: warnMsg });
      }

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

    // Use PowerShell on Windows, bash on Unix
    let proc;
    if (isWindows || run.scriptPath.endsWith('.ps1')) {
      proc = spawn('powershell', [
        '-ExecutionPolicy', 'Bypass', '-File', run.scriptPath,
      ], {
        cwd: run.projectPath,
        env: { ...process.env, INTERACTIVE: '0', CHECKPOINTS: '0', FAIL_FAST: '0' },
      });
    } else {
      proc = spawn('bash', [run.scriptPath], {
        cwd: run.projectPath,
        env: { ...process.env, INTERACTIVE: '0', CHECKPOINTS: '0', FAIL_FAST: '0' },
      });
    }

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

      // Finalize all phases: mark any still-running phases as done,
      // and extract agent summaries from their accumulated output.
      // Small delay to let the log watcher flush any remaining output.
      setTimeout(() => {
        finalizePhases(run, code);
        saveRunSummary(run, code);
      }, 1000);

      io.to(run.id).emit('run:status', { status: run.status, exitCode: code });
      if (run.watcher) {
        // Give the watcher a moment to flush remaining log data before closing
        setTimeout(() => {
          if (run.watcher) run.watcher.close();
        }, 1500);
      }
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

  // Map from log file basename (e.g. "phase3_palette_types") to the canonical
  // phaseId used in run.phases. This lets us merge log-file output into the
  // phase entry that was already created by parsePhaseInfo from stdout.
  const logToPhaseId = new Map();

  const watcher = chokidar.watch(logDir, {
    ignored: /(^|[\/\\])\../,
    persistent: true, ignoreInitial: false,
    awaitWriteFinish: { stabilityThreshold: 300, pollInterval: 100 },
  });

  watcher.on('add', (filePath) => {
    if (!filePath.endsWith('.log')) return;
    const basename = path.basename(filePath, '.log');

    // Try to match this log file to an existing stdout-parsed phase.
    // Log files are typically named "phase3_palette_types.log" — extract the
    // phase number and look for an existing "phase3" entry.
    const phaseNumMatch = basename.match(/^phase(\d+|N)/i);
    let canonicalId = null;

    if (phaseNumMatch) {
      const stdoutPhaseId = `phase${phaseNumMatch[1]}`;
      if (run.phases[stdoutPhaseId]) {
        // Merge: attach the log file to the existing stdout-parsed phase
        canonicalId = stdoutPhaseId;
        run.phases[canonicalId].logFile = filePath;
      }
    }

    if (!canonicalId) {
      // No existing phase found — create a new entry from the log file name
      canonicalId = basename;
      const label = basename.replace(/_/g, ' ').replace(/^phase\d+\s*/, 'Phase ');
      if (!run.phases[canonicalId]) {
        run.phases[canonicalId] = { label: label || canonicalId, status: 'running', output: '', logFile: filePath };
        io.to(run.id).emit('run:phase', { phaseId: canonicalId, label: run.phases[canonicalId].label, status: 'running', output: '' });
      }
    }

    logToPhaseId.set(basename, canonicalId);
    tailedFiles.set(filePath, { offset: 0, phaseId: canonicalId });
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
// We buffer incomplete lines across stdout chunks so that a ✅ or ❌ line
// split across two data events is still detected correctly.
function parsePhaseInfo(run, text) {
  // Append to line buffer and split into complete lines
  if (!run._phaseLineBuf) run._phaseLineBuf = '';
  run._phaseLineBuf += text;
  const lines = run._phaseLineBuf.split('\n');
  // Keep the last (possibly incomplete) line in the buffer
  run._phaseLineBuf = lines.pop() || '';

  for (const line of lines) {
    // --- Detect phase start: PHASE 3 [Sonnet]: Update palette types ---
    const startMatch = line.match(/PHASE\s+(\d+|N)\s*\[([^\]]+)\]:\s*(.+)/);
    if (startMatch) {
      const [, phaseNum, model, label] = startMatch;
      const phaseId = `phase${phaseNum}`;
      if (!run.phases[phaseId]) {
        run.phases[phaseId] = { label: `Phase ${phaseNum}: ${label.trim()}`, model, status: 'running', output: '' };
      } else {
        run.phases[phaseId].label = `Phase ${phaseNum}: ${label.trim()}`;
        run.phases[phaseId].model = model;
      }
      io.to(run.id).emit('run:phase', { phaseId, label: run.phases[phaseId].label, model, status: 'running' });
    }

    // --- Detect completion: ✅ lines from log_ok ---
    // Template produces: [HH:MM:SS] ✅ Phase 3: Update palette types
    // or from wait_all:  [HH:MM:SS] ✅   Phase 3: Update palette types
    if (/✅/.test(line)) {
      // Try to extract a phase number directly from the line
      const phaseNumInLine = line.match(/Phase\s+(\d+|N)/i);
      if (phaseNumInLine) {
        const phaseId = `phase${phaseNumInLine[1]}`;
        if (run.phases[phaseId] && run.phases[phaseId].status === 'running') {
          run.phases[phaseId].status = 'completed';
          io.to(run.id).emit('run:phase', { phaseId, ...run.phases[phaseId] });
        }
      } else {
        // Fallback: check all running phases for label match
        for (const [phaseId, phase] of Object.entries(run.phases)) {
          if (phase.status === 'running' && phase.label && line.includes(phase.label)) {
            phase.status = 'completed';
            io.to(run.id).emit('run:phase', { phaseId, ...phase });
          }
        }
      }
    }

    // --- Detect failure: ❌ lines from log_err ---
    if (/❌/.test(line)) {
      const phaseNumInLine = line.match(/Phase\s+(\d+|N)/i);
      if (phaseNumInLine) {
        const phaseId = `phase${phaseNumInLine[1]}`;
        if (run.phases[phaseId] && run.phases[phaseId].status === 'running') {
          run.phases[phaseId].status = 'failed';
          io.to(run.id).emit('run:phase', { phaseId, ...run.phases[phaseId] });
        }
      } else {
        for (const [phaseId, phase] of Object.entries(run.phases)) {
          if (phase.status === 'running' && phase.label && line.includes(phase.label)) {
            phase.status = 'failed';
            io.to(run.id).emit('run:phase', { phaseId, ...phase });
          }
        }
      }
    }

    // --- Detect skip: ⏭️ SKIP Phase 3 — already done ---
    if (/⏭️/.test(line)) {
      const skipPhaseNum = line.match(/Phase\s+(\d+|N)/i);
      if (skipPhaseNum) {
        const phaseId = `phase${skipPhaseNum[1]}`;
        if (run.phases[phaseId]) {
          run.phases[phaseId].status = 'skipped';
          io.to(run.id).emit('run:phase', { phaseId, ...run.phases[phaseId] });
        }
      } else {
        const skipMatch = line.match(/⏭️\s*SKIP\s*(.*?)—/);
        if (skipMatch) {
          const skipLabel = skipMatch[1].trim();
          for (const [phaseId, phase] of Object.entries(run.phases)) {
            if (phase.label && phase.label.includes(skipLabel)) {
              phase.status = 'skipped';
              io.to(run.id).emit('run:phase', { phaseId, ...phase });
            }
          }
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Finalize all phases when the script process exits.
// Any phase still in 'running' state is transitioned based on exit code.
// Also extracts agent summaries from accumulated log output.
// ---------------------------------------------------------------------------
// Persist a snapshot of the run's terminal state to disk so the SummaryPage
// can be re-displayed when the run is restored from /api/previous-runs.
// Writes summary.json (metadata + phases) and main.log (full main output, capped).
function saveRunSummary(run, exitCode = null) {
  try {
    const summary = {
      schemaVersion: 1,
      runId: run.id,
      prompt: run.prompt,
      projectPath: run.projectPath,
      contextFolders: Array.isArray(run.contextFolders) ? run.contextFolders : [],
      status: run.status,
      exitCode: typeof exitCode === 'number' ? exitCode : null,
      createdAt: run.createdAt,
      finishedAt: new Date().toISOString(),
      planModel: run.planModel,
      generateModel: run.generateModel,
      sessionId: run.sessionId || null,
      planSessionId: run.planSessionId || null,
      totalOutputChars: typeof run.mainOutput === 'string' ? run.mainOutput.length : 0,
      phases: Object.fromEntries(
        Object.entries(run.phases || {}).map(([id, p]) => [id, {
          label: p.label,
          status: p.status,
          model: p.model || null,
          summary: p.summary || '',
        }])
      ),
    };
    fs.writeFileSync(
      path.join(run.logDir, 'summary.json'),
      JSON.stringify(summary, null, 2)
    );

    // Persist the main output too, capped to keep disk usage sane.
    const mainOutput = typeof run.mainOutput === 'string' ? run.mainOutput : '';
    const cap = 1 * 1024 * 1024; // 1 MB
    let toSave = mainOutput;
    if (mainOutput.length > cap) {
      const half = Math.floor(cap / 2);
      toSave =
        mainOutput.slice(0, half) +
        `\n\n...[truncated ${mainOutput.length - cap} chars]...\n\n` +
        mainOutput.slice(-half);
    }
    fs.writeFileSync(path.join(run.logDir, 'main.log'), toSave);
  } catch (err) {
    console.error(`[saveRunSummary] failed for run ${run.id}:`, err.message);
  }
}

function finalizePhases(run, exitCode) {
  const terminalStatus = exitCode === 0 ? 'completed' : 'failed';

  for (const [phaseId, phase] of Object.entries(run.phases)) {
    if (phase.status === 'running') {
      // Extract summary from the phase output before marking done
      const summary = extractAgentSummary(phase.output || '');
      phase.status = terminalStatus;
      if (summary) phase.summary = summary;
      io.to(run.id).emit('run:phase', { phaseId, ...phase });
    } else if (!phase.summary && phase.output) {
      // Phase already completed/failed but we haven't extracted summary yet
      const summary = extractAgentSummary(phase.output);
      if (summary) {
        phase.summary = summary;
        io.to(run.id).emit('run:phase', { phaseId, ...phase });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Extract agent summary from raw qodo CLI output.
// The agent typically ends with a natural-language summary of what it did,
// after all tool calls are complete. We look for the last block of
// non-tool-call text.
// ---------------------------------------------------------------------------
function extractAgentSummary(rawOutput) {
  if (!rawOutput || rawOutput.length < 50) return '';

  // Strip ANSI codes for analysis
  // eslint-disable-next-line no-control-regex
  const clean = rawOutput.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
                         .replace(/\x1b\][^\x07]*\x07/g, '')
                         .replace(/\x1b\[[\?]?[0-9;]*[a-zA-Z]/g, '');

  // The qodo agent output has tool calls marked with patterns like:
  //   +- tool_name
  //   |-- param: value
  //   `--- [OK] or [ERR]
  // The summary is the final block of plain text after the last tool call result.

  // Find the last tool call result marker
  const lastToolResult = Math.max(
    clean.lastIndexOf('[OK]'),
    clean.lastIndexOf('[ERR]'),
    clean.lastIndexOf('`---'),
  );

  let summaryBlock = '';
  if (lastToolResult !== -1) {
    // Get everything after the last tool result line
    const afterTools = clean.substring(lastToolResult);
    const firstNewline = afterTools.indexOf('\n');
    if (firstNewline !== -1) {
      summaryBlock = afterTools.substring(firstNewline + 1).trim();
    }
  }

  if (!summaryBlock) {
    // Fallback: take the last ~500 chars and look for summary-like text
    const tail = clean.substring(Math.max(0, clean.length - 1000)).trim();
    // Look for common summary patterns
    const summaryPatterns = [
      /(?:Here's a summary|Summary of|All \d+ (?:files?|changes)|Changes made|I've (?:completed|updated|modified|made))([\s\S]*)/i,
      /(?:###\s+(?:Summary|Changes|Results))([\s\S]*)/i,
    ];
    for (const pattern of summaryPatterns) {
      const m = tail.match(pattern);
      if (m) {
        summaryBlock = m[0].trim();
        break;
      }
    }
  }

  // Clean up and truncate
  if (summaryBlock) {
    // Remove any remaining tool-call artifacts
    summaryBlock = summaryBlock.replace(/^\s*\+[-─]\s.*$/gm, '').trim();
    // Limit to reasonable length
    if (summaryBlock.length > 2000) {
      summaryBlock = summaryBlock.substring(0, 2000) + '…';
    }
  }

  return summaryBlock;
}

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------
const PORT = process.env.PORT || 3847;
server.listen(PORT, () => {
  console.log(`\n  🚀 Qodo Agent Team GUI running at http://localhost:${PORT}\n`);
});
