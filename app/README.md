# Qodo Agent Team — Web GUI

A web-based interface for orchestrating Qodo Agent Team scripts. Write a single prompt, pick a project folder, and watch your agents work in real time.

## Quick Start

```bash
cd app
npm install
npm run dev
```

Then open **http://localhost:3847** in your browser.

## How It Works

The app runs a **3-stage pipeline**:

### Stage 1: Plan (`qodo --plan`)
A planner agent analyzes your task and produces a structured plan covering:
- Phase breakdown (sequential vs parallel)
- Model assignment per phase (Opus vs Sonnet)
- File scope per phase (with zero-overlap verification for parallel phases)
- Skip checks for idempotency
- Shared brief contents
- Risk assessment

### Stage 2: Review & Approve
You review the plan in the browser with full markdown rendering. You can:
- **Approve** — proceed to script generation
- **Request Changes** — send feedback and re-plan
- **Edit** — directly modify the plan text before approving

### Stage 3: Generate & Execute
A generator agent fills the bash template using the approved plan, then the script executes with real-time output streaming.

## Features

- **Model selector** — Choose from 30+ models for both the plan and generate stages (Anthropic, OpenAI, Google, NVIDIA, xAI)
- **Plan review** — See the agent's plan before any code runs; request changes or edit directly
- **Folder browser** — Navigate your filesystem to select the target project
- **Real-time streaming** — WebSocket-based live output from all agents
- **Parallel agent view** — Split-pane display showing each parallel agent's work simultaneously
- **Phase tracking** — Visual status indicators (running/completed/failed/skipped) for each phase
- **Progress stepper** — Visual pipeline indicator: Plan → Review → Generate → Execute
- **Interactive input** — Send responses to script prompts (checkpoints, confirmations)
- **Follow-up chat** — After completion, continue the conversation using `--resume` to refine results
- **Stop control** — Kill a running script and all child processes
- **Re-runnable** — Start new runs without restarting the server

## Requirements

- Node.js 18+
- `qodo` CLI installed and authenticated
- The `template.sh` and `GUIDE.md` files in the parent directory

## Configuration

Set the port via environment variable:

```bash
PORT=4000 npm run dev
```

## Architecture

```
app/
├── server.js          # Express + Socket.IO backend
├── public/
│   └── index.html     # Single-page frontend (vanilla JS, no build step)
├── package.json
└── README.md
```

### Backend Pipeline

1. **`/api/models`** — Serves the available model list to the frontend
2. **`run:start`** (WebSocket) — Spawns `qodo --plan` to analyze the task
3. **`run:approve-plan`** (WebSocket) — Spawns `qodo` to generate the script from the plan + template
4. Script execution with `bash` — streams stdout/stderr via WebSocket
5. **`chokidar`** log watcher — tails individual phase log files for parallel agent output
6. **`/api/runs/:id/chat`** — Spawns `qodo --resume=<session_id>` for follow-up conversations

### Key qodo CLI flags used

| Flag | Purpose |
|------|---------|
| `--plan` | Stage 1: task analysis and planning |
| `--ci -y` | Non-interactive mode |
| `--permissions=rwx` | Full file access |
| `--model=<id>` | Model selection |
| `--dir=<path>` | Working directory |
| `--resume=<id>` | Continue a previous session (follow-up chat) |
