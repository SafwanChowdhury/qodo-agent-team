# Implementation Status: Conversational Plan Stage

## ✅ Completed (Backend)

The server has been rewritten to support back-and-forth conversation during the plan stage using a **`--resume` approach** (not `--chat`, which is not a valid qodo flag).

### Architecture: One-shot + Resume

Instead of a persistent `--chat` process (which doesn't exist in qodo), the plan stage uses:

1. **Initial plan**: A one-shot `qodo --ci --plan` call that produces the first plan and exits
2. **Follow-ups**: Each user message spawns a new `qodo --ci --plan --resume=<sessionId>` call
3. **Session continuity**: The session ID is captured from stderr after each call and reused for the next `--resume`

### Key Functions:

1. **`startPlanProcess(run)`** — Spawns the initial `qodo --ci --plan` call with the full planning prompt (GUIDE + TEMPLATE + user task). Captures session ID from stderr on close.

2. **`resumePlanProcess(run, userMessage)`** — Spawns a new `qodo --ci --plan --resume=<planSessionId>` call with the user's follow-up message. Updates conversation history and captures updated session ID.

3. **`_spawnPlanCall(run, qodoArgs)`** — Shared helper that handles stdout streaming, stderr capture, session ID extraction, conversation recording, and status transitions.

### Socket Events:

- `run:plan-message` — User sends a follow-up message → calls `resumePlanProcess()`
- `run:plan-conversation` — Server broadcasts the full conversation history
- `run:plan-stream` — Real-time streaming of agent responses (stdout chunks)
- `run:approve-plan` — User approves → kills any in-flight plan process, proceeds to generate

### Plan Context Passed to Script Generator:

The `runGenerateStage()` function now includes the **full plan conversation** in the generate prompt when there were multiple rounds of refinement. This ensures the script generator understands:
- What was originally proposed
- What the user asked to change
- What the final approved plan looks like

For single-round plans, only the plan output is included (as before).

### State Fields:

- `run.planConversation` — Array of `{ role: 'user'|'agent', content: string }`
- `run.planSessionId` — Session ID for plan `--resume` follow-ups (separate from `run.sessionId` used for post-execution chat)
- `run.planProcess` — The current qodo process (null between calls)
- `run._planCurrentResponse` — Buffer for the current agent response being streamed

## ✅ Completed (Frontend)

The React frontend fully supports the conversational plan UI:

- **PlanTab** component handles three states: `planning` (streaming), `plan-review` (conversation + actions), and post-review (read-only)
- **ChatBubble** component renders user/agent messages in a chat thread
- **MarkdownRenderer** renders agent plan responses with styled markdown
- Socket listeners for `run:plan-stream`, `run:plan-conversation`, `run:plan` are wired in `useSocket.ts`
- Zustand store tracks `planConversation`, `planStreaming`, `planOutput`

## Flow Summary

```
User submits task
  → run:start
  → startPlanProcess() — qodo --ci --plan (one-shot)
  → stdout streams via run:plan-stream
  → process exits → capture sessionId → status: plan-review

User sends feedback
  → run:plan-message
  → resumePlanProcess() — qodo --ci --plan --resume=<id> <message>
  → stdout streams via run:plan-stream
  → process exits → update sessionId → status: plan-review

User approves
  → run:approve-plan
  → runGenerateStage() — includes full conversation context in prompt
  → executeScript()
```

## Key Design Decisions

- **No `--chat` flag**: qodo does not support `--chat`. All interactions are one-shot `--ci` calls with `--resume` for continuity.
- **Separate session IDs**: `planSessionId` (for plan conversation) vs `sessionId` (for post-execution follow-up chat) are tracked independently.
- **Full context to generator**: When the plan had multiple rounds, the entire conversation is included in the generate prompt so the script generator has full context of what was discussed and decided.
- **No idle detection needed**: Since each call is one-shot, the process exits naturally when the response is complete. No need for idle timeout heuristics.
