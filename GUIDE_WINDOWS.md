# Qodo Agent Team — Script Guide (Windows / PowerShell)

Scripts in this repo spin up multiple `qodo` CLI instances and coordinate them toward a single goal. Each script is a series of **phases**. Phases run sequentially by default; a subset can run in parallel when their file sets do not overlap.

**Platform:** this guide describes the PowerShell variant of the orchestration script. The script runs under either Windows PowerShell 5.1 or PowerShell 7+ (`pwsh`). Use `template.ps1` (not `template.sh`) as the source template.

---

## Top-level options

These flags live at the top of the script, just after the `Config` section. They are read from environment variables so the web GUI can run the script non-interactively without editing it.

```powershell
$INTERACTIVE = if ($null -ne $env:INTERACTIVE) { [int]$env:INTERACTIVE } else { 1 }
$CHECKPOINTS = if ($null -ne $env:CHECKPOINTS) { [int]$env:CHECKPOINTS } else { 1 }
$FAIL_FAST   = if ($null -ne $env:FAIL_FAST)   { [int]$env:FAIL_FAST }   else { 1 }
```

| Var | Effect |
|---|---|
| `INTERACTIVE=0` | Skip every `Read-Host` prompt (CI / web GUI). |
| `CHECKPOINTS=0` | Skip `Show-Checkpoint` pauses (still emit log lines). |
| `FAIL_FAST=0`   | Auto-continue past failed phases without prompting. |

The web GUI sets all three to `0` when it executes the script.

---

## Phase types

### Sequential phase

Runs to completion before the next phase starts. Use for work that downstream phases depend on.

```powershell
$prompt1 = @"
$brief

TASK: ...
"@
Run-Phase `
    -Label   'Phase 1: do the thing' `
    -LogFile (Join-Path $LOG 'phase1_do_thing.log') `
    -ProjPath $PROJ `
    -QodoArgs $OpusArgs `
    -Prompt $prompt1
```

`Run-Phase` streams qodo's combined stdout+stderr to the log file via `Tee-Object` and to the parent stdout so the GUI can scrape `PHASE N [Model]: …` and `[OK] Phase N` lines.

**When to use:** DB migrations (before TypeScript types), auth flow (before UI), integration + build (always last).

### Parallel — background jobs (`Launch-Bg` / `Wait-AllBg`)

Each call to `Launch-Bg` starts a PowerShell background job (`Start-Job`) whose combined stream is captured to a log file. The GUI's log watcher tails those files to surface live output.

```powershell
$prompt3 = @"
$brief

TASK: ...

FILES: Update ONLY these files (zero overlap with other parallel phases):
  src/foo.ts
  src/bar.ts
"@
Launch-Bg `
    -Label   'Phase 3: foo+bar' `
    -LogFile (Join-Path $LOG 'phase3_foo_bar.log') `
    -ProjPath $PROJ `
    -QodoArgs $SonnetArgs `
    -Prompt $prompt3

# ...more Launch-Bg calls...

Wait-AllBg
```

**When to use:** Multiple agents editing disjoint file sets.

**Hard rule:** File sets across all concurrent `Launch-Bg` calls must have zero overlap. Two agents writing the same file will corrupt it.

> There is no `tmux`-style live-pane runner on Windows. The web GUI surfaces per-phase output by watching each phase's log file in `$LOG`.

---

## Checkpoints

A checkpoint pauses the script and shows a message. Use them after phases that produce artifacts a human should review before the next phase consumes them.

```powershell
Show-Checkpoint -Message "Review migration SQL at $migrationFile before applying to local DB"
```

**Typical placement:**
- After writing a SQL migration, before `supabase db reset`
- After a large code generation phase, before integration
- Never needed after mechanical edits (renames, type fixes)

Checkpoints are skipped when `CHECKPOINTS=0` or `INTERACTIVE=0`.

---

## Skip checks

Every phase has a `PhaseN-Done` function. Return `$true` = skip, `$false` = run.

Choose the check based on what the phase produces:

| What the phase produces | PowerShell check |
|---|---|
| A new file | `Test-Path (Join-Path $PROJ 'path\to\file')` |
| A symbol added to an existing file | `Select-String -Path (Join-Path $PROJ 'src\file.ts') -Pattern 'symbol' -Quiet -ErrorAction SilentlyContinue` |
| A symbol removed from a file | `-not (Select-String -Path (Join-Path $PROJ 'src\file.ts') -Pattern 'old_symbol' -Quiet -ErrorAction SilentlyContinue)` |
| A passing build | `Push-Location $PROJ; npm run build --silent 2>$null; $ok = $LASTEXITCODE -eq 0; Pop-Location; $ok` |
| A file renamed/deleted | `-not (Test-Path (Join-Path $PROJ 'path\to\old_file'))` |

The script calls every skip check before showing the phase plan, so the user sees exactly what will and won't run before pressing Enter.

---

## Model selection

| Variable | Use for |
|---|---|
| `$OpusArgs`   | Complex reasoning: DB migrations, architecture, auth flows, integration passes, build fixes |
| `$SonnetArgs` | Mechanical work: renames, type updates, UI component edits, dead code deletion |

These are arg arrays passed to qodo via `& qodo @QodoArgs --dir=$PROJ $prompt`. Define them once near the top of `Config` and pick whichever fits each phase. Opus is slower and more expensive — only reach for it when the task requires judgment across many files or involves tricky logic.

---

## The brief

The brief is written to `$BRIEF` (`{LOG}\brief.md`) before any phases run. Every agent receives it prepended to their task prompt:

```powershell
$brief = Get-Content $BRIEF -Raw
$prompt = @"
$brief

TASK: ...
"@
```

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
2. Verify zero overlap across all concurrent `Launch-Bg` calls before running.
3. If two phases need to touch the same file, make them sequential.
4. The integration phase (always last, always sequential) is the designated place to resolve any cross-phase inconsistencies.

---

## Phase ordering patterns

These patterns are the recommended defaults:

```
1   [Opus]   Foundation work (DB migration / architecture)
2   [local / Sonnet]  Apply / verify the foundation (db reset, type regen)
3   [Opus]   Critical path sequential work (auth, wizard, core logic)
-- parallel ----------------------------------------------------
4+  [Sonnet] Disjoint UI / component work
-- end parallel ------------------------------------------------
N   [Opus]   Integration pass + build (always last, always sequential)
```

The integration phase scans for stale references left by parallel phases, fixes cross-phase type inconsistencies, runs the build, and verifies key invariants. Never skip it.

---

## PowerShell-specific gotchas

- **Path separators.** Build paths with `Join-Path $PROJ 'src\foo.ts'` rather than hard-coding `/` or `\`. `Test-Path`, `Get-Content`, etc. accept either, but consistency keeps the log output readable.
- **Quoting prompts.** Use a here-string `@"` … `"@` for the multi-line prompt that includes the brief plus the task. Single-quoted here-strings (`@'` … `'@`) suppress variable expansion — only use them for the brief content emitted to `$BRIEF`.
- **`$LASTEXITCODE`.** After a native call (`& qodo …`), check `$LASTEXITCODE`, not `$?`. The helper functions already do this for you.
- **Background jobs are isolated.** A `Launch-Bg` job runs in a separate PowerShell process — outer `$brief` etc. must be passed explicitly via `-ArgumentList`. The helper handles this; you only supply `-Prompt`.
- **No `tmux`.** Don't reference tmux in the generated script. Use `Launch-Bg` / `Wait-AllBg` for every parallel group.
- **`qodo` resolution.** `qodo` is normally installed as `qodo.cmd` (an npm shim) on Windows. The helper invokes it via the call operator (`& qodo …`), which resolves cmd-shims correctly.

---

## Filling the template

When given a task, a qodo instance filling `template.ps1` should:

1. Decide the phase breakdown — what work can be parallelised (disjoint files), what must be sequential (dependencies).
2. Choose a model arg array (`$OpusArgs` or `$SonnetArgs`) per phase.
3. Write skip checks that precisely detect completed work using `Test-Path` / `Select-String` patterns above.
4. Write the brief — shared context every agent needs.
5. Write each phase's `TASK:` prompt — specific, file-scoped instructions.
6. Place `Show-Checkpoint` calls only where human review adds value.
7. Leave the env-var top-level flags (`INTERACTIVE`, `CHECKPOINTS`, `FAIL_FAST`) intact — the GUI sets them to `0` automatically.
8. Remove any unused `{{PLACEHOLDER}}` blocks. The final script must contain no `{{...}}` markers and no `AGENT:` comments.
