# Qodo Agent Team — Script Guide

Scripts in this repo spin up multiple `qodo` CLI instances and coordinate them toward a single goal. Each script is a series of **phases**. Phases run sequentially by default; a subset can run in parallel when their file sets do not overlap.

---

## Top-level options

These flags live at the top of the script, just after Config. The user sets them before the first run.

```bash
# Top of script, after PROJ/LOG/BRIEF are set:
INTERACTIVE=1          # set 0 to skip all read -rp prompts (checkpoints + phase-plan pause)
CHECKPOINTS=1          # set 0 to skip checkpoint() pauses (still shows log messages)
FAIL_FAST=1            # set 0 to auto-continue past failed phases without prompting
```

When `INTERACTIVE=0`, the script is fully non-interactive — suitable for CI.  
When `CHECKPOINTS=0`, checkpoint pauses are skipped but sequential and parallel error prompts still fire (unless `FAIL_FAST=0` too).

Implement the helpers as:

```bash
checkpoint() {
  [[ $CHECKPOINTS -eq 0 ]] && return 0
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  CHECKPOINT: $1"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  [[ $INTERACTIVE -eq 0 ]] && return 0
  read -rp "Press Enter to continue (Ctrl+C to abort)... "
}

# Inside run_phase and wait_all, replace bare read -rp with:
if [[ $FAIL_FAST -eq 1 && $INTERACTIVE -eq 1 ]]; then
  read -rp "Continue anyway? [y/N] " yn
  [[ "${yn:-N}" =~ ^[Yy]$ ]] || fail "Aborted at: $label"
elif [[ $FAIL_FAST -eq 1 ]]; then
  fail "Aborted at: $label"
fi
```

---

## Phase types

### Sequential phase

Runs to completion before the next phase starts. Use for work that downstream phases depend on.

```bash
run_phase "Phase N: label" "$LOG/phaseN_slug.log" \
  $MODEL --dir="$PROJ" "$(cat "$BRIEF")

TASK: ..."
```

**When to use:** DB migrations (before TypeScript types), auth flow (before UI), integration + build (always last).

### Parallel — background (`launch_bg` / `wait_all`)

Launches agents as background processes. No live output. Logs written to files.

```bash
launch_bg "Phase N: label" "$LOG/phaseN.log" \
  $MODEL --dir="$PROJ" "$(cat "$BRIEF")

TASK: ..."

# ... more launch_bg calls ...

wait_all
```

**When to use:** Multiple agents editing disjoint file sets. No need to watch them in real time. Simpler setup — no tmux required.

**Hard rule:** File sets across all concurrent `launch_bg` calls must have zero overlap. Two agents writing the same file will corrupt it.

### Parallel — tmux (`run_tmux_parallel`)

Launches each agent in its own visible tmux pane. The main shell polls sentinel files to detect completion.

**When to use:** Same conditions as background parallel, but you want to watch agents work in real time — useful for long-running phases or when debugging prompts.

**Additional requirement:** `tmux` must be installed (`brew install tmux`). Add to preflight:
```bash
command -v tmux >/dev/null 2>&1 || fail "tmux not found — brew install tmux"
```

---

## Checkpoints

A checkpoint pauses the script and shows a message. Use them after phases that produce artifacts a human should review before the next phase consumes them.

```bash
checkpoint "Review migration SQL at $MIGRATION_FILE before applying to local DB"
```

**Typical placement:**
- After writing a SQL migration, before `supabase db reset`
- After a large code generation phase, before integration
- Never needed after mechanical edits (renames, type fixes)

Checkpoints are skipped when `CHECKPOINTS=0` or `INTERACTIVE=0`.

---

## Skip checks

Every phase has a `phaseN_done()` function. Return `0` = skip, `1` = run.

Choose the check based on what the phase produces:

| What the phase produces | Check pattern |
|---|---|
| A new file | `[[ -f "$PROJ/path/to/file" ]]` |
| A symbol added to an existing file | `grep -q 'symbol' "$PROJ/src/file.ts" 2>/dev/null` |
| A symbol removed from a file | `! grep -q 'old_symbol' "$PROJ/src/file.ts" 2>/dev/null` |
| A DB table | `psql ... -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_name='x'"` |
| A passing build | `(cd "$PROJ" && npm run build --silent 2>/dev/null)` |
| A file renamed/deleted | `[[ ! -f "$PROJ/path/to/old_file" ]]` |

The script calls every skip check before showing the phase plan, so the user sees exactly what will and won't run before pressing Enter.

---

## Model selection

| Model | Use for |
|---|---|
| `$OPUS` | Complex reasoning: DB migrations, architecture, auth flows, integration passes, build fixes |
| `$SONNET` | Mechanical work: renames, type updates, UI component edits, dead code deletion |

Opus is slower and more expensive. Only reach for it when the task requires judgment across many files or involves tricky logic.

---

## The brief

The brief is written to `$BRIEF` before any phases run. Every agent receives it prepended to their task prompt via `$(cat "$BRIEF")`.

Include in the brief:
- What the overall task is doing and why
- Key decisions already made (so agents don't re-litigate them)
- Schemas, naming conventions, rename maps
- Patterns agents must follow (e.g. how to query a joined table)
- What must NOT change

Keep task-specific instructions out of the brief — put those directly in each phase's `TASK:` block.

---

## Parallel phase file discipline

The most common failure mode is two parallel agents editing the same file. Rules:

1. List files explicitly in each parallel phase prompt under `FILES: Update ONLY these files`.
2. Verify zero overlap across all concurrent phases before running.
3. If two phases need to touch the same file, make them sequential.
4. The integration phase (always last, always sequential) is the designated place to resolve any cross-phase inconsistencies.

---

## Phase ordering patterns

These patterns appear across all three scripts and are the recommended defaults:

```
1   [Opus]   Foundation work (DB migration / architecture)
2   [local / Sonnet]  Apply / verify the foundation (db reset, type regen)
3   [Opus]   Critical path sequential work (auth, wizard, core logic)
── parallel ──────────────────────────────────────────
4+  [Sonnet] Disjoint UI / component work
── end parallel ──────────────────────────────────────
N   [Opus]   Integration pass + build (always last, always sequential)
```

The integration phase scans for stale references left by parallel phases, fixes cross-phase type inconsistencies, runs the build, and verifies key invariants. Never skip it.

---

## Filling the template

When given a task, a qodo instance filling `template.sh` should:

1. Decide the phase breakdown — what work can be parallelised (disjoint files), what must be sequential (dependencies).
2. Choose a model per phase.
3. Write skip checks that precisely detect completed work.
4. Write the brief — shared context every agent needs.
5. Write each phase's `TASK:` prompt — specific, file-scoped instructions.
6. Place checkpoints only where human review adds value.
7. Set top-level flags (`CHECKPOINTS`, `INTERACTIVE`, `FAIL_FAST`) as defaults appropriate for the task, with a comment that the user can change them.
8. Remove template blocks that aren't used (e.g. remove the tmux runner if using background parallel, or vice versa).
