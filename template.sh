#!/bin/bash
# =============================================================================
# {{SCRIPT_NAME}}.sh — {{ONE_LINE_DESCRIPTION}}
#
# Usage:
#   chmod +x {{SCRIPT_NAME}}.sh && ./{{SCRIPT_NAME}}.sh
#
# Safe to re-run — every phase checks whether its work is already done
# and skips if so.
#
# Requirements:
#   - qodo CLI installed and authenticated
#   {{EXTRA_REQUIREMENTS}}
#
# Logs: /tmp/{{LOG_DIR}}/
#
# Execution order:
#   {{PHASE_OVERVIEW_COMMENT}}
#   Example:
#     1   [Opus]   Write migration SQL
#     2   [Sonnet] Update TypeScript types
#     ── parallel ─────────────────────────────────────────────────
#     3   [Sonnet] Update auth flow
#     4   [Sonnet] Update dashboard UI
#     ── end parallel ─────────────────────────────────────────────
#     5   [Opus]   Integration pass + build
# =============================================================================

# AGENT: Fill in every {{PLACEHOLDER}} before running.
# AGENT: Add or remove phase blocks as needed — there is no fixed phase count.
# AGENT: For each phase decide: sequential (run_phase) or parallel (launch_bg / tmux).
# AGENT: Sequential phases must finish before the next one starts.
# AGENT: Parallel phases run simultaneously — use when file sets do not overlap.
# AGENT: Use OPUS for complex reasoning, architecture, SQL, build fixes.
# AGENT: Use SONNET for mechanical edits, renames, UI changes, type updates.

set -uo pipefail

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
PROJ="{{ABSOLUTE_PATH_TO_PROJECT}}"
LOG=/tmp/{{LOG_DIR}}
BRIEF="$LOG/brief.md"

# AGENT: Set TMUX_SESSION only if you have parallel phases that use the tmux runner.
# AGENT: If all parallel phases use launch_bg/wait_all, you can remove this line.
TMUX_SESSION="{{TMUX_SESSION_NAME}}"

OPUS="qodo --ci -y --permissions=rwx --model=anthropic/claude-opus-4-6"
SONNET="qodo --ci -y --permissions=rwx --model=anthropic/claude-sonnet-4-6"

# ---------------------------------------------------------------------------
# Helpers — copy verbatim, do not edit
# ---------------------------------------------------------------------------
log()     { echo "[$(date '+%H:%M:%S')] $*"; }
log_ok()  { echo "[$(date '+%H:%M:%S')] ✅ $*"; }
log_skip(){ echo "[$(date '+%H:%M:%S')] ⏭️  SKIP $* — already done"; }
log_err() { echo "[$(date '+%H:%M:%S')] ❌ $*" >&2; }
fail()    { log_err "$*"; exit 1; }

run_phase() {
  local label="$1" logfile="$2"; shift 2
  log "Starting: $label"
  if "$@" 2>&1 | tee "$logfile"; then
    log_ok "$label"; return 0
  else
    local code="${PIPESTATUS[0]}"
    log_err "$label exited $code — see $logfile"
    read -rp "Continue anyway? [y/N] " yn
    [[ "${yn:-N}" =~ ^[Yy]$ ]] || fail "Aborted at: $label"
    return $code
  fi
}

checkpoint() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  CHECKPOINT: $1"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  read -rp "Press Enter to continue (Ctrl+C to abort)... "
  echo ""
}

# --- Background parallel runner (no tmux, no live output) ---
# Use when you don't need to watch agents in real time.
declare -a BG_PIDS=() BG_LABELS=() BG_LOGS=()

launch_bg() {
  local label="$1" logfile="$2"; shift 2
  log "  Launching: $label → $(basename "$logfile")"
  "$@" > "$logfile" 2>&1 &
  BG_PIDS+=("$!"); BG_LABELS+=("$label"); BG_LOGS+=("$logfile")
}

wait_all() {
  local any_failed=0 i
  for i in "${!BG_PIDS[@]}"; do
    if wait "${BG_PIDS[$i]}"; then log_ok "  ${BG_LABELS[$i]}"
    else log_err "  ${BG_LABELS[$i]} (see ${BG_LOGS[$i]})"; any_failed=1; fi
  done
  BG_PIDS=(); BG_LABELS=(); BG_LOGS=()
  if [[ $any_failed -eq 1 ]]; then
    read -rp "One or more parallel tasks failed. Continue? [y/N] " yn
    [[ "${yn:-N}" =~ ^[Yy]$ ]] || fail "Aborted after parallel failure"
  fi
}

# --- tmux parallel runner (visible panes) ---
# Use when you want to watch agents work in real time.
# Replace N_PHASES with the actual number of parallel phases.
# Add/remove split-window and send-keys blocks to match phase count.
run_tmux_parallel() {
  # AGENT: args are skip flags, one per parallel phase, e.g.: run_tmux_parallel "$P3" "$P4" "$P5"
  # AGENT: Expand this function body to match how many phases you have.

  local sentinel_dir="$LOG/sentinels"
  mkdir -p "$sentinel_dir"
  # AGENT: List every sentinel file for the phases in this parallel group.
  rm -f "$sentinel_dir"/phase{3,4,5}.done   # <-- AGENT: adjust phase numbers

  # AGENT: Define one cmd variable per parallel phase.
  # Pattern:
  #   if skip → write sentinel immediately
  #   else     → run qodo, write sentinel on exit, show result, drop to bash
  local cmd3 cmd4 cmd5   # <-- AGENT: adjust variable names

  if [[ "${1}" -eq 1 ]]; then
    cmd3="echo '⏭️  Phase 3 already done — skipping'; echo 0 > $sentinel_dir/phase3.done; bash"
  else
    cmd3="echo '🔵 Phase 3 [{{MODEL}}]: {{PHASE_3_LABEL}}'; echo ''; \
${{MODEL_VAR}} --dir=\"$PROJ\" \
\"$(cat "$BRIEF")

{{PHASE_3_TASK_PROMPT}}\"; \
echo \$? > $sentinel_dir/phase3.done; \
[[ \$(cat $sentinel_dir/phase3.done) == '0' ]] \
  && echo '' && echo '✅ Phase 3 complete' \
  || echo '' && echo '❌ Phase 3 failed'; \
echo ''; echo 'Press Ctrl+C or close this pane.'; bash"
  fi

  # AGENT: Repeat the if/else block above for each additional parallel phase.
  # cmd4="..."
  # cmd5="..."

  # Create tmux session
  if tmux has-session -t "$TMUX_SESSION" 2>/dev/null; then
    tmux kill-session -t "$TMUX_SESSION"
  fi
  tmux new-session -d -s "$TMUX_SESSION" -x 220 -y 50 -n "parallel-phases"

  # First pane gets cmd3
  tmux send-keys -t "$TMUX_SESSION" "$cmd3" Enter

  # AGENT: Add one split + send-keys block per additional phase.
  tmux split-window -h -t "$TMUX_SESSION"
  tmux send-keys -t "$TMUX_SESSION" "$cmd4" Enter

  tmux split-window -h -t "$TMUX_SESSION"
  tmux send-keys -t "$TMUX_SESSION" "$cmd5" Enter

  tmux select-layout -t "$TMUX_SESSION" even-horizontal

  log ""
  log "Parallel phases are running in tmux: tmux attach -t $TMUX_SESSION"
  log "  (Ctrl+B then D to detach and return here)"
  log ""
  log "Waiting for all parallel phases to complete..."

  local elapsed=0 timeout=1800
  while true; do
    local done_count=0
    # AGENT: Check the sentinel file for each parallel phase.
    [[ -f "$sentinel_dir/phase3.done" ]] && ((done_count++)) || true
    [[ -f "$sentinel_dir/phase4.done" ]] && ((done_count++)) || true
    [[ -f "$sentinel_dir/phase5.done" ]] && ((done_count++)) || true
    local total=3  # AGENT: set to actual number of parallel phases

    if [[ $done_count -eq $total ]]; then break; fi
    if [[ $elapsed -ge $timeout ]]; then
      log_err "Parallel phases timed out after 30 minutes"
      read -rp "Continue anyway? [y/N] " yn
      [[ "${yn:-N}" =~ ^[Yy]$ ]] || fail "Aborted after timeout"
      break
    fi
    sleep 5; ((elapsed += 5)) || true
    if (( elapsed % 30 == 0 )); then
      log "Still waiting... ($done_count/$total done, ${elapsed}s elapsed)"
    fi
  done

  local any_failed=0
  # AGENT: Check the exit code for each parallel phase.
  for phase in 3 4 5; do   # <-- AGENT: adjust phase numbers
    local sentinel="$sentinel_dir/phase${phase}.done"
    if [[ -f "$sentinel" ]]; then
      local code; code=$(cat "$sentinel" | tr -d '[:space:]')
      if [[ "$code" == "0" ]]; then log_ok "  Phase $phase"
      else log_err "  Phase $phase failed (exit $code)"; any_failed=1; fi
    else
      log_err "  Phase $phase — no sentinel (may have crashed)"; any_failed=1
    fi
  done
  tmux kill-session -t "$TMUX_SESSION" 2>/dev/null || true

  if [[ $any_failed -eq 1 ]]; then
    read -rp "One or more parallel phases failed. Continue? [y/N] " yn
    [[ "${yn:-N}" =~ ^[Yy]$ ]] || fail "Aborted after parallel phase failure"
  fi
}

# ---------------------------------------------------------------------------
# Skip checks
# AGENT: Write one function per phase.
# Return 0 (true) = already done, skip.
# Return 1 (false) = needs to run.
# Check a concrete artifact that only exists after the phase succeeds:
#   file existence, grep for a symbol, build passing, table existing, etc.
# ---------------------------------------------------------------------------

phase1_done() {
  # AGENT: Replace with a real idempotency check for Phase 1.
  # Example: file exists
  # [[ -f "$PROJ/path/to/expected/output.ts" ]] \
  #   && { log_skip "Phase 1 — output.ts already exists"; return 0; }
  # Example: grep for a symbol
  # grep -q 'expectedSymbol' "$PROJ/src/some/file.ts" 2>/dev/null \
  #   && { log_skip "Phase 1 — already done"; return 0; }
  return 1
}

# AGENT: Add phase2_done(), phase3_done(), ... for every phase you define.
# Template for each:
#
# phaseN_done() {
#   {{SKIP_CHECK_CONDITION}} \
#     && { log_skip "Phase N — {{ALREADY_DONE_REASON}}"; return 0; }
#   return 1
# }

# ---------------------------------------------------------------------------
# Preflight
# ---------------------------------------------------------------------------
log "Checking prerequisites..."
command -v qodo >/dev/null 2>&1 || fail "qodo not found"
# AGENT: Add checks for every tool your phases require.
# Examples:
#   command -v node     >/dev/null 2>&1 || fail "node not found"
#   command -v supabase >/dev/null 2>&1 || fail "supabase CLI not found"
#   command -v tmux     >/dev/null 2>&1 || fail "tmux not found — brew install tmux"
#   [[ -d "$PROJ/src" ]]          || fail "No src/ in $PROJ"
#   [[ -f "$PROJ/package.json" ]] || fail "No package.json in $PROJ"
{{EXTRA_PREFLIGHT_CHECKS}}

mkdir -p "$LOG"
log "Project: $PROJ"
log "Logs:    $LOG"

# ---------------------------------------------------------------------------
# Scan — determine which phases need to run
# AGENT: Add one line per phase: phaseN_done && PN=1 || PN=0
# ---------------------------------------------------------------------------
log ""
log "Scanning project to determine which phases need to run..."

phase1_done && P1=1 || P1=0
# AGENT: phase2_done && P2=1 || P2=0
# AGENT: phase3_done && P3=1 || P3=0
# ... continue for all phases

# ---------------------------------------------------------------------------
# Phase plan display
# AGENT: Add one line per phase inside the box.
# Keep label text under ~50 chars to fit in the box.
# Mark parallel phases with ┐ ├─parallel or ┐ ├─tmux on the right side.
# ---------------------------------------------------------------------------
echo ""
echo "┌────────────────────────────────────────────────────────────────┐"
echo "│  {{SCRIPT_NAME}}.sh — phase plan                              │"
echo "├────────────────────────────────────────────────────────────────┤"
[[ $P1 -eq 1 ]] \
  && echo "│  Phase 1  ⏭️  SKIP  [{{MODEL}}] {{PHASE_1_LABEL:<40}}│" \
  || echo "│  Phase 1  🔵 RUN   [{{MODEL}}] {{PHASE_1_LABEL:<40}}│"
# AGENT: Repeat for every phase. Parallel groups look like:
# [[ $P3 -eq 1 ]] && echo "│  Phase 3  ⏭️  SKIP  ...  ┐      │" || echo "│  Phase 3  🔵 RUN   ...  ┐      │"
# [[ $P4 -eq 1 ]] && echo "│  Phase 4  ⏭️  SKIP  ...  ├─parallel│" || ...
# [[ $P5 -eq 1 ]] && echo "│  Phase 5  ⏭️  SKIP  ...  ┘      │" || ...
echo "└────────────────────────────────────────────────────────────────┘"
echo ""
read -rp "Press Enter to proceed (Ctrl+C to abort)... "

# ---------------------------------------------------------------------------
# Shared brief
# AGENT: Write all background context the agents need here.
# Include: what the task is doing, key decisions already made, schemas,
# naming conventions, patterns to follow, what NOT to change.
# Every agent receives this brief prepended to their specific task prompt.
# ---------------------------------------------------------------------------
cat > "$BRIEF" << 'BRIEF_EOF'
# {{BRIEF_TITLE}}

## What this task does
{{HIGH_LEVEL_DESCRIPTION}}

## Key decisions / constraints
{{DECISIONS_AND_CONSTRAINTS}}

## Naming conventions / schemas
{{NAMING_AND_SCHEMAS}}

## What must NOT change
{{DO_NOT_CHANGE}}
BRIEF_EOF

log_ok "Brief ready"

# =============================================================================
# PHASE 1 — {{MODEL}}: {{PHASE_1_LABEL}}
# AGENT: Sequential phase template. Copy this block for each sequential phase.
# =============================================================================
log ""
log "════════════════════════════════════════════════"
log "PHASE 1 [{{MODEL}}]: {{PHASE_1_LABEL}}"
log "════════════════════════════════════════════════"

if [[ $P1 -eq 0 ]]; then
  run_phase "Phase 1: {{PHASE_1_LABEL}}" "$LOG/phase1_{{PHASE_1_SLUG}}.log" \
    ${{MODEL_VAR}} --dir="$PROJ" \
    "$(cat "$BRIEF")

TASK: {{PHASE_1_TASK_PROMPT}}

{{PHASE_1_DETAILED_INSTRUCTIONS}}"

  # AGENT: Add a checkpoint after phases that produce artifacts needing human review
  # before the next phase runs (e.g. SQL migration before db reset).
  # checkpoint "Review {{ARTIFACT}} at {{PATH}} before continuing"
fi

# =============================================================================
# PHASE 2 — {{MODEL}}: {{PHASE_2_LABEL}}
# AGENT: Add as many sequential phases as your task requires.
# =============================================================================
log ""
log "════════════════════════════════════════════════"
log "PHASE 2 [{{MODEL}}]: {{PHASE_2_LABEL}}"
log "════════════════════════════════════════════════"

if [[ $P2 -eq 0 ]]; then
  run_phase "Phase 2: {{PHASE_2_LABEL}}" "$LOG/phase2_{{PHASE_2_SLUG}}.log" \
    ${{MODEL_VAR}} --dir="$PROJ" \
    "$(cat "$BRIEF")

TASK: {{PHASE_2_TASK_PROMPT}}

{{PHASE_2_DETAILED_INSTRUCTIONS}}"
fi

# =============================================================================
# PHASES 3+4+5 — Parallel (background, no live view)
# AGENT: Use this block when phases have zero file overlap and you don't need
# to watch them run. Remove the tmux runner if you use this style.
# Rename/add phases as needed.
# =============================================================================
log ""
log "════════════════════════════════════════════════"
log "PHASES 3+4+5: Parallel instances (background)"
log "════════════════════════════════════════════════"

PARALLEL_RUN=0
[[ $P3 -eq 0 ]] && PARALLEL_RUN=1
[[ $P4 -eq 0 ]] && PARALLEL_RUN=1
[[ $P5 -eq 0 ]] && PARALLEL_RUN=1
# AGENT: Add more [[ $PN -eq 0 ]] && PARALLEL_RUN=1 lines for extra phases.

if [[ $PARALLEL_RUN -eq 1 ]]; then

  if [[ $P3 -eq 0 ]]; then
    launch_bg "Phase 3: {{PHASE_3_LABEL}}" "$LOG/phase3_{{PHASE_3_SLUG}}.log" \
      ${{MODEL_VAR}} --dir="$PROJ" \
      "$(cat "$BRIEF")

TASK: {{PHASE_3_TASK_PROMPT}}

FILES: Update ONLY these files (zero overlap with other parallel phases):
  {{PHASE_3_FILE_LIST}}

{{PHASE_3_DETAILED_INSTRUCTIONS}}"
  fi

  if [[ $P4 -eq 0 ]]; then
    launch_bg "Phase 4: {{PHASE_4_LABEL}}" "$LOG/phase4_{{PHASE_4_SLUG}}.log" \
      ${{MODEL_VAR}} --dir="$PROJ" \
      "$(cat "$BRIEF")

TASK: {{PHASE_4_TASK_PROMPT}}

FILES: Update ONLY these files (zero overlap with other parallel phases):
  {{PHASE_4_FILE_LIST}}

{{PHASE_4_DETAILED_INSTRUCTIONS}}"
  fi

  if [[ $P5 -eq 0 ]]; then
    launch_bg "Phase 5: {{PHASE_5_LABEL}}" "$LOG/phase5_{{PHASE_5_SLUG}}.log" \
      ${{MODEL_VAR}} --dir="$PROJ" \
      "$(cat "$BRIEF")

TASK: {{PHASE_5_TASK_PROMPT}}

FILES: Update ONLY these files (zero overlap with other parallel phases):
  {{PHASE_5_FILE_LIST}}

{{PHASE_5_DETAILED_INSTRUCTIONS}}"
  fi

  # AGENT: Add more launch_bg blocks for additional parallel phases.

  log "Waiting for parallel phases (3, 4, 5)..."
  wait_all
  log_ok "Parallel phases complete"
else
  log_skip "Phases 3+4+5 — all already done"
fi

# =============================================================================
# PHASES X+Y+Z — Parallel (tmux, live view)
# AGENT: Use this block instead of the background runner when you want to
# watch agents in real time. Call run_tmux_parallel with skip flags.
# Make sure TMUX_SESSION is set in Config and tmux is in preflight checks.
# Remove this block if you are using launch_bg for all parallel phases.
# =============================================================================
# PARALLEL_RUN=0
# [[ $P3 -eq 0 ]] && PARALLEL_RUN=1
# [[ $P4 -eq 0 ]] && PARALLEL_RUN=1
# [[ $P5 -eq 0 ]] && PARALLEL_RUN=1
#
# if [[ $PARALLEL_RUN -eq 1 ]]; then
#   run_tmux_parallel "$P3" "$P4" "$P5"
#   log_ok "Parallel phases complete"
# else
#   log_skip "Phases 3+4+5 — all already done"
# fi

# =============================================================================
# PHASE N (last) — Opus: Integration pass + build
# AGENT: The final phase should always be an integration + build check.
# It scans for any missed changes and gets the build green.
# Replace {{STALE_PATTERNS}} with the actual patterns from earlier phases.
# =============================================================================
log ""
log "════════════════════════════════════════════════"
log "PHASE N [Opus]: Integration + build"
log "════════════════════════════════════════════════"

if [[ $PN -eq 0 ]]; then
  run_phase "Phase N: Integration + build" "$LOG/phaseN_integrate.log" \
    $OPUS --dir="$PROJ" \
    "$(cat "$BRIEF")

TASK: Scan for remaining issues introduced by earlier phases, then get the build passing.

STEP 1 — Scan src/ for stale patterns and fix any found:
  {{STALE_PATTERNS_TO_FIX}}

STEP 2 — Run build:
  cd $PROJ && {{BUILD_COMMAND}}
  Fix ALL type/compile errors at root cause. No suppression comments.

STEP 3 — Verify key invariants:
  {{VERIFICATION_CHECKLIST}}"
fi

# =============================================================================
# Done
# =============================================================================
log ""
log "════════════════════════════════════════════════"
log_ok "{{SCRIPT_NAME}}.sh complete!"
log "════════════════════════════════════════════════"
log ""
# AGENT: List every phase with its label.
log "  ✅ Phase 1  {{PHASE_1_LABEL}}"
log "  ✅ Phase 2  {{PHASE_2_LABEL}}"
log "  ✅ Phase 3  {{PHASE_3_LABEL}}"
log "  ✅ Phase 4  {{PHASE_4_LABEL}}"
log "  ✅ Phase 5  {{PHASE_5_LABEL}}"
log "  ✅ Phase N  Integration + build passing"
log ""
log "All logs in $LOG:"
for f in "$LOG"/*.log; do log "  $f"; done
