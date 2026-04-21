# Qodo Agent Team — Web GUI

A web-based interface for orchestrating Qodo Agent Team scripts. Write a single prompt, pick a project folder, and watch your agents work in real time.

## Quick Start

```bash
cd app
npm run install:all
npm run dev
```

Then open **http://localhost:3847** in your browser.

### Install Scripts

| Command | Description |
|---------|-------------|
| `npm run install:all` | Installs dependencies for both the server (`app/`) and the frontend (`app/frontend/`) |
| `npm run setup` | Installs all dependencies **and** builds the frontend for production |
| `npm run dev` | Starts the server and Vite dev server concurrently (hot-reload) |
| `npm run build` | Builds the frontend for production |
| `npm start` | Starts the production server (serve the pre-built frontend) |

### Production Setup

```bash
cd app
npm run setup    # install + build in one step
npm start        # serve at http://localhost:3847
```

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

### Stage 3: Generate, Review & Execute
A generator agent fills the bash template using the approved plan. You then review the generated script before execution:
- **Approve Script** — proceed to execution
- **Request Changes** — provide feedback and regenerate the script
- **Execute** — the script runs with real-time output streaming

### Execution Summary
When execution completes (success, failure, or stopped), a **summary page** is automatically displayed showing:
- **Status banner** — overall result (completed/failed/stopped) with the task description
- **Stats grid** — total phases, completed count, failed count, and output size
- **Phase results** — each phase listed with its status, model used, and agent summary (extracted from the agent's final output)
- **Plan overview** — the approved plan rendered in markdown
- **Quick actions** — view full logs, re-run the script, or start a new run

You can dismiss the summary to return to the full log/tab view at any time, and re-open it via the "📊 View Execution Summary" button.

## Features

- **Model selector** — Choose from 30+ models for both the plan and generate stages (Anthropic, OpenAI, Google, NVIDIA, xAI)
- **Plan review** — See the agent's plan before any code runs; request changes or edit directly
- **Script review** — Review the generated bash script before execution; request changes or approve
- **Folder browser** — Navigate your filesystem to select the target project
- **Real-time streaming** — WebSocket-based live output from all agents
- **Parallel agent view** — Split-pane display showing each parallel agent's work simultaneously
- **Phase tracking** — Visual status indicators (running/completed/failed/skipped) for each phase
- **Progress stepper** — Visual pipeline indicator: Plan → Review → Generate → Script Review → Execute
- **Execution summary** — Automatic summary page on completion with phase results, stats, and agent summaries
- **Interactive input** — Send responses to script prompts (checkpoints, confirmations)
- **Follow-up chat** — After completion, continue the conversation using `--resume` to refine results
- **Stop control** — Kill a running script and all child processes
- **Re-runnable** — Re-run failed scripts (with optional manual edits to `run.sh`) or start fresh runs
- **Previous runs** — Browse and restore previous runs from `/tmp/qodo-team-*` directories

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
├── server.js              # Express + Socket.IO backend
├── package.json           # Server dependencies + unified scripts
├── public/
│   └── index.html         # Fallback HTML
└── frontend/
    ├── package.json       # Frontend dependencies (React, Vite)
    ├── index.html         # Vite entry point
    ├── vite.config.ts
    ├── tailwind.config.ts
    └── src/
        ├── App.tsx                    # Router: SetupPage + RunPage
        ├── main.tsx                   # React entry
        ├── pages/
        │   ├── SetupPage.tsx          # Project path, prompt, model selection
        │   └── RunPage.tsx            # Execution view + summary integration
        ├── components/
        │   ├── Header.tsx             # App header with branding
        │   ├── Stepper.tsx            # Pipeline progress indicator
        │   ├── Terminal.tsx           # ANSI-aware terminal output
        │   ├── PlanTab.tsx            # Plan review with conversation history
        │   ├── ScriptVisualizer.tsx   # Script review with phase highlighting
        │   ├── ParallelView.tsx       # Grid of parallel phase panes
        │   ├── SummaryPage.tsx        # Post-execution summary dashboard
        │   ├── RespondBar.tsx         # Input bar for responses/chat
        │   ├── FolderBrowser.tsx      # Filesystem directory browser
        │   ├── MarkdownRenderer.tsx   # Markdown rendering component
        │   └── ui/                    # Shared UI primitives (button, dialog, etc.)
        ├── hooks/
        │   ├── useSocket.ts           # Socket.IO event listener registration
        │   └── useModels.ts           # Model list fetching
        ├── store/
        │   └── runStore.ts            # Zustand state management
        ├── lib/
        │   ├── socket.ts             # Socket.IO client + typed emit helpers
        │   └── utils.ts              # Utility functions (cn, etc.)
        ���── types/
            └── index.ts              # TypeScript type definitions
```

### Backend Pipeline

1. **`/api/models`** — Serves the available model list to the frontend
2. **`/api/browse`** — Filesystem directory browser for project selection
3. **`/api/previous-runs`** — Lists previous run directories from `/tmp/qodo-team-*`
4. **`run:start`** (WebSocket) — Spawns `qodo --plan` to analyze the task
5. **`run:plan-message`** (WebSocket) — Sends follow-up messages during plan review via `--resume`
6. **`run:approve-plan`** (WebSocket) — Spawns `qodo` to generate the script from the plan + template
7. **`run:approve-script`** (WebSocket) — Executes the generated script
8. **`run:reject-script`** (WebSocket) — Regenerates the script with user feedback
9. Script execution with `bash` — streams stdout/stderr via WebSocket
10. **`chokidar`** log watcher — tails individual phase log files for parallel agent output
11. Phase finalization — extracts agent summaries from log output when execution completes
12. **`/api/runs/:id/chat`** — Spawns `qodo --resume=<session_id>` for follow-up conversations

### Key qodo CLI flags used

| Flag | Purpose |
|------|---------|
| `--plan` | Stage 1: task analysis and planning |
| `--ci -y` | Non-interactive mode |
| `--permissions=rwx` | Full file access |
| `--model=<id>` | Model selection |
| `--dir=<path>` | Working directory |
| `--resume=<id>` | Continue a previous session (plan follow-ups, post-execution chat) |
