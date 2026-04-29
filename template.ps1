# =============================================================================
# {{SCRIPT_NAME}}.ps1 — {{ONE_LINE_DESCRIPTION}}
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\{{SCRIPT_NAME}}.ps1
#
# Safe to re-run — every phase checks whether its work is already done
# and skips if so.
#
# Requirements:
#   - qodo CLI installed and authenticated (qodo.cmd on PATH)
#   - PowerShell 5.1+ (Windows PowerShell) or PowerShell 7+ (pwsh)
#   {{EXTRA_REQUIREMENTS}}
#
# Logs: {{LOG_DIR}}
#
# Execution order:
#   {{PHASE_OVERVIEW_COMMENT}}
#   Example:
#     1   [Opus]   Write migration SQL
#     2   [Sonnet] Update TypeScript types
#     -- parallel ----------------------------------------------------
#     3   [Sonnet] Update auth flow
#     4   [Sonnet] Update dashboard UI
#     -- end parallel ------------------------------------------------
#     5   [Opus]   Integration pass + build
# =============================================================================

# AGENT: Fill in every {{PLACEHOLDER}} before running.
# AGENT: Add or remove phase blocks as needed — there is no fixed phase count.
# AGENT: For each phase decide: sequential (Run-Phase) or parallel (Launch-Bg / Wait-AllBg).
# AGENT: Sequential phases must finish before the next one starts.
# AGENT: Parallel phases run simultaneously — use when file sets do not overlap.
# AGENT: Use OPUS for complex reasoning, architecture, SQL, build fixes.
# AGENT: Use SONNET for mechanical edits, renames, UI changes, type updates.

$ErrorActionPreference = 'Continue'

# ---------------------------------------------------------------------------
# Top-level options (controllable via environment variables)
#   INTERACTIVE=1  : prompt on failure (default)
#   INTERACTIVE=0  : never prompt — fully non-interactive (CI / web GUI)
#   CHECKPOINTS=1  : honour Show-Checkpoint pauses (default)
#   CHECKPOINTS=0  : skip Show-Checkpoint pauses (still log them)
#   FAIL_FAST=1    : abort the script on phase failure (default)
#   FAIL_FAST=0    : log the failure and continue
# ---------------------------------------------------------------------------
$INTERACTIVE = if ($null -ne $env:INTERACTIVE) { [int]$env:INTERACTIVE } else { 1 }
$CHECKPOINTS = if ($null -ne $env:CHECKPOINTS) { [int]$env:CHECKPOINTS } else { 1 }
$FAIL_FAST   = if ($null -ne $env:FAIL_FAST)   { [int]$env:FAIL_FAST }   else { 1 }

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
$PROJ  = "{{ABSOLUTE_PATH_TO_PROJECT}}"
$LOG   = "{{LOG_DIR}}"
$BRIEF = Join-Path $LOG 'brief.md'

# AGENT: Define the qodo invocation arg arrays. The LLM should set the model
# strings to match what the plan specifies. Keep the --ci -y --permissions=rwx
# flags — they make qodo non-interactive.
$OpusArgs   = @('--ci', '-y', '--permissions=rwx', '--model=anthropic/claude-opus-4-6')
$SonnetArgs = @('--ci', '-y', '--permissions=rwx', '--model=anthropic/claude-sonnet-4-6')

# ---------------------------------------------------------------------------
# Helpers — copy verbatim, do not edit
# ---------------------------------------------------------------------------
function Log {
    param([Parameter(ValueFromRemainingArguments=$true)] [string[]]$Msg)
    $ts = (Get-Date -Format 'HH:mm:ss')
    Write-Host "[$ts] $($Msg -join ' ')"
}

function Log-Ok {
    param([Parameter(ValueFromRemainingArguments=$true)] [string[]]$Msg)
    $ts = (Get-Date -Format 'HH:mm:ss')
    Write-Host "[$ts] [OK] $($Msg -join ' ')"
}

function Log-Skip {
    param([Parameter(ValueFromRemainingArguments=$true)] [string[]]$Msg)
    $ts = (Get-Date -Format 'HH:mm:ss')
    Write-Host "[$ts] [SKIP] $($Msg -join ' ') -- already done"
}

function Log-Err {
    param([Parameter(ValueFromRemainingArguments=$true)] [string[]]$Msg)
    $ts = (Get-Date -Format 'HH:mm:ss')
    [Console]::Error.WriteLine("[$ts] [ERR] $($Msg -join ' ')")
}

function Fail {
    param([Parameter(ValueFromRemainingArguments=$true)] [string[]]$Msg)
    Log-Err @Msg
    exit 1
}

# Run-Phase — sequential phase runner.
# Streams qodo's combined stdout+stderr to a log file AND to the parent stdout
# so the GUI can detect "PHASE N [Model]: Label" / "[OK] Phase N" lines.
function Run-Phase {
    param(
        [Parameter(Mandatory=$true)][string]$Label,
        [Parameter(Mandatory=$true)][string]$LogFile,
        [Parameter(Mandatory=$true)][string]$ProjPath,
        [Parameter(Mandatory=$true)][string[]]$QodoArgs,
        [Parameter(Mandatory=$true)][string]$Prompt
    )
    Log "Starting: $Label"
    & qodo @QodoArgs --dir=$ProjPath $Prompt 2>&1 |
        Tee-Object -FilePath $LogFile
    $exit = $LASTEXITCODE
    if ($exit -eq 0) {
        Log-Ok $Label
        return 0
    }
    Log-Err "$Label exited $exit -- see $LogFile"
    if ($script:FAIL_FAST -eq 1 -and $script:INTERACTIVE -eq 1) {
        $yn = Read-Host 'Continue anyway? [y/N]'
        if ($yn -notmatch '^[Yy]') { Fail "Aborted at: $Label" }
    } elseif ($script:FAIL_FAST -eq 1) {
        Fail "Aborted at: $Label"
    }
    return $exit
}

function Show-Checkpoint {
    param([Parameter(Mandatory=$true)][string]$Message)
    Write-Host ''
    Write-Host '------------------------------------------------------------'
    Write-Host "  CHECKPOINT: $Message"
    Write-Host '------------------------------------------------------------'
    if ($script:CHECKPOINTS -eq 0) { return }
    if ($script:INTERACTIVE -eq 0) { return }
    Read-Host 'Press Enter to continue (Ctrl+C to abort)'
    Write-Host ''
}

# ---------------------------------------------------------------------------
# Background parallel runner — uses PowerShell jobs.
# (PowerShell does not have tmux; live output from parallel agents is read
#  by the GUI by tailing each phase's log file in $LOG.)
# ---------------------------------------------------------------------------
$script:BgJobs = @()

function Launch-Bg {
    param(
        [Parameter(Mandatory=$true)][string]$Label,
        [Parameter(Mandatory=$true)][string]$LogFile,
        [Parameter(Mandatory=$true)][string]$ProjPath,
        [Parameter(Mandatory=$true)][string[]]$QodoArgs,
        [Parameter(Mandatory=$true)][string]$Prompt
    )
    Log "  Launching: $Label -> $(Split-Path -Leaf $LogFile)"
    $job = Start-Job -Name $Label -ScriptBlock {
        param($logFile, $projPath, $qodoArgs, $prompt)
        try {
            Set-Location $projPath
        } catch { }
        & qodo @qodoArgs --dir=$projPath $prompt *>&1 |
            Out-File -FilePath $logFile -Encoding UTF8
        exit $LASTEXITCODE
    } -ArgumentList $LogFile, $ProjPath, $QodoArgs, $Prompt
    $script:BgJobs += [pscustomobject]@{
        Job     = $job
        Label   = $Label
        LogFile = $LogFile
    }
}

function Wait-AllBg {
    if ($script:BgJobs.Count -eq 0) { return }

    $jobs = $script:BgJobs | ForEach-Object { $_.Job }
    Wait-Job -Job $jobs | Out-Null

    $anyFailed = $false
    foreach ($entry in $script:BgJobs) {
        # Drain any remaining output that hasn't been flushed to the log file.
        try { Receive-Job -Job $entry.Job -Keep | Out-Null } catch { }
        if ($entry.Job.State -eq 'Completed') {
            Log-Ok ("  " + $entry.Label)
        } else {
            Log-Err ("  " + $entry.Label + " (state=" + $entry.Job.State + ", see " + $entry.LogFile + ")")
            $anyFailed = $true
        }
        Remove-Job -Job $entry.Job -Force
    }
    $script:BgJobs = @()

    if ($anyFailed) {
        if ($script:FAIL_FAST -eq 1 -and $script:INTERACTIVE -eq 1) {
            $yn = Read-Host 'One or more parallel tasks failed. Continue? [y/N]'
            if ($yn -notmatch '^[Yy]') { Fail 'Aborted after parallel failure' }
        } elseif ($script:FAIL_FAST -eq 1) {
            Fail 'Aborted after parallel failure'
        }
    }
}

# ---------------------------------------------------------------------------
# Skip checks
# AGENT: Write one function per phase.
# Return $true  = already done, skip.
# Return $false = needs to run.
# Check a concrete artifact that only exists after the phase succeeds:
#   file existence, Select-String for a symbol, build passing, etc.
# ---------------------------------------------------------------------------

function Phase1-Done {
    # AGENT: Replace with a real idempotency check for Phase 1.
    # Examples:
    #   if (Test-Path (Join-Path $PROJ 'path\to\expected\output.ts')) {
    #       Log-Skip 'Phase 1 -- output.ts already exists'; return $true
    #   }
    #   if (Select-String -Path (Join-Path $PROJ 'src\some\file.ts') -Pattern 'expectedSymbol' -Quiet -ErrorAction SilentlyContinue) {
    #       Log-Skip 'Phase 1 -- already done'; return $true
    #   }
    return $false
}

# AGENT: Add Phase2-Done, Phase3-Done, ... for every phase you define.
# Template for each:
#
# function PhaseN-Done {
#     if ({{SKIP_CHECK_CONDITION}}) {
#         Log-Skip 'Phase N -- {{ALREADY_DONE_REASON}}'
#         return $true
#     }
#     return $false
# }

# ---------------------------------------------------------------------------
# Preflight
# ---------------------------------------------------------------------------
Log 'Checking prerequisites...'
if (-not (Get-Command qodo -ErrorAction SilentlyContinue)) {
    Fail 'qodo not found on PATH'
}
# AGENT: Add checks for every tool your phases require.
# Examples:
#   if (-not (Get-Command node -ErrorAction SilentlyContinue))     { Fail 'node not found' }
#   if (-not (Get-Command supabase -ErrorAction SilentlyContinue)) { Fail 'supabase CLI not found' }
#   if (-not (Test-Path (Join-Path $PROJ 'src')))          { Fail "No src in $PROJ" }
#   if (-not (Test-Path (Join-Path $PROJ 'package.json'))) { Fail "No package.json in $PROJ" }
{{EXTRA_PREFLIGHT_CHECKS}}

New-Item -ItemType Directory -Force -Path $LOG | Out-Null
Log "Project: $PROJ"
Log "Logs:    $LOG"

# ---------------------------------------------------------------------------
# Scan — determine which phases need to run
# AGENT: Add one line per phase: $P1 = if (Phase1-Done) { 1 } else { 0 }
# ---------------------------------------------------------------------------
Log ''
Log 'Scanning project to determine which phases need to run...'

$P1 = if (Phase1-Done) { 1 } else { 0 }
# AGENT: $P2 = if (Phase2-Done) { 1 } else { 0 }
# AGENT: $P3 = if (Phase3-Done) { 1 } else { 0 }
# ... continue for all phases

# ---------------------------------------------------------------------------
# Phase plan display
# AGENT: Emit one line per phase. Mark parallel groups in the trailing column.
# ---------------------------------------------------------------------------
Write-Host ''
Write-Host '+----------------------------------------------------------------+'
Write-Host "|  {{SCRIPT_NAME}}.ps1 -- phase plan                             |"
Write-Host '+----------------------------------------------------------------+'
if ($P1 -eq 1) {
    Write-Host "|  Phase 1  [SKIP]  [{{MODEL}}] {{PHASE_1_LABEL}}"
} else {
    Write-Host "|  Phase 1  [RUN ]  [{{MODEL}}] {{PHASE_1_LABEL}}"
}
# AGENT: Repeat for every phase. Parallel groups can be annotated:
#   "|  Phase 3  [RUN ]  [Sonnet] Update palette types       <-- parallel"
Write-Host '+----------------------------------------------------------------+'
Write-Host ''

if ($script:INTERACTIVE -eq 1) {
    Read-Host 'Press Enter to proceed (Ctrl+C to abort)' | Out-Null
}

# ---------------------------------------------------------------------------
# Shared brief
# AGENT: Write all background context the agents need here.
# Include: what the task is doing, key decisions already made, schemas,
# naming conventions, patterns to follow, what NOT to change.
# Every agent receives this brief prepended to their specific task prompt.
# ---------------------------------------------------------------------------
@'
# {{BRIEF_TITLE}}

## What this task does
{{HIGH_LEVEL_DESCRIPTION}}

## Key decisions / constraints
{{DECISIONS_AND_CONSTRAINTS}}

## Naming conventions / schemas
{{NAMING_AND_SCHEMAS}}

## What must NOT change
{{DO_NOT_CHANGE}}
'@ | Set-Content -Path $BRIEF -Encoding UTF8

Log-Ok 'Brief ready'

$brief = Get-Content $BRIEF -Raw

# =============================================================================
# PHASE 1 -- {{MODEL}}: {{PHASE_1_LABEL}}
# AGENT: Sequential phase template. Copy this block for each sequential phase.
# =============================================================================
Log ''
Log '================================================'
Log "PHASE 1 [{{MODEL}}]: {{PHASE_1_LABEL}}"
Log '================================================'

if ($P1 -eq 0) {
    $prompt1 = @"
$brief

TASK: {{PHASE_1_TASK_PROMPT}}

{{PHASE_1_DETAILED_INSTRUCTIONS}}
"@
    Run-Phase `
        -Label   "Phase 1: {{PHASE_1_LABEL}}" `
        -LogFile (Join-Path $LOG 'phase1_{{PHASE_1_SLUG}}.log') `
        -ProjPath $PROJ `
        -QodoArgs ${{MODEL_VAR}} `
        -Prompt $prompt1

    # AGENT: Add a checkpoint after phases that produce artifacts needing
    # human review before the next phase runs (e.g. SQL migration before db reset).
    # Show-Checkpoint -Message 'Review {{ARTIFACT}} at {{PATH}} before continuing'
}

# =============================================================================
# PHASE 2 -- {{MODEL}}: {{PHASE_2_LABEL}}
# AGENT: Add as many sequential phases as your task requires.
# =============================================================================
Log ''
Log '================================================'
Log "PHASE 2 [{{MODEL}}]: {{PHASE_2_LABEL}}"
Log '================================================'

if ($P2 -eq 0) {
    $prompt2 = @"
$brief

TASK: {{PHASE_2_TASK_PROMPT}}

{{PHASE_2_DETAILED_INSTRUCTIONS}}
"@
    Run-Phase `
        -Label   "Phase 2: {{PHASE_2_LABEL}}" `
        -LogFile (Join-Path $LOG 'phase2_{{PHASE_2_SLUG}}.log') `
        -ProjPath $PROJ `
        -QodoArgs ${{MODEL_VAR}} `
        -Prompt $prompt2
}

# =============================================================================
# PHASES 3+4+5 -- Parallel (background jobs)
# AGENT: Use this block when phases have zero file overlap. Each Launch-Bg
# call kicks off a PowerShell background job that streams its output to the
# given log file. Wait-AllBg blocks until all parallel phases finish.
# =============================================================================
Log ''
Log '================================================'
Log 'PHASES 3+4+5: Parallel instances (background)'
Log '================================================'

$ParallelRun = 0
if ($P3 -eq 0) { $ParallelRun = 1 }
if ($P4 -eq 0) { $ParallelRun = 1 }
if ($P5 -eq 0) { $ParallelRun = 1 }
# AGENT: Add more `if ($PN -eq 0) { $ParallelRun = 1 }` lines for extra phases.

if ($ParallelRun -eq 1) {

    if ($P3 -eq 0) {
        $prompt3 = @"
$brief

TASK: {{PHASE_3_TASK_PROMPT}}

FILES: Update ONLY these files (zero overlap with other parallel phases):
  {{PHASE_3_FILE_LIST}}

{{PHASE_3_DETAILED_INSTRUCTIONS}}
"@
        Launch-Bg `
            -Label   "Phase 3: {{PHASE_3_LABEL}}" `
            -LogFile (Join-Path $LOG 'phase3_{{PHASE_3_SLUG}}.log') `
            -ProjPath $PROJ `
            -QodoArgs ${{MODEL_VAR}} `
            -Prompt $prompt3
    }

    if ($P4 -eq 0) {
        $prompt4 = @"
$brief

TASK: {{PHASE_4_TASK_PROMPT}}

FILES: Update ONLY these files (zero overlap with other parallel phases):
  {{PHASE_4_FILE_LIST}}

{{PHASE_4_DETAILED_INSTRUCTIONS}}
"@
        Launch-Bg `
            -Label   "Phase 4: {{PHASE_4_LABEL}}" `
            -LogFile (Join-Path $LOG 'phase4_{{PHASE_4_SLUG}}.log') `
            -ProjPath $PROJ `
            -QodoArgs ${{MODEL_VAR}} `
            -Prompt $prompt4
    }

    if ($P5 -eq 0) {
        $prompt5 = @"
$brief

TASK: {{PHASE_5_TASK_PROMPT}}

FILES: Update ONLY these files (zero overlap with other parallel phases):
  {{PHASE_5_FILE_LIST}}

{{PHASE_5_DETAILED_INSTRUCTIONS}}
"@
        Launch-Bg `
            -Label   "Phase 5: {{PHASE_5_LABEL}}" `
            -LogFile (Join-Path $LOG 'phase5_{{PHASE_5_SLUG}}.log') `
            -ProjPath $PROJ `
            -QodoArgs ${{MODEL_VAR}} `
            -Prompt $prompt5
    }

    # AGENT: Add more Launch-Bg blocks for additional parallel phases.

    Log 'Waiting for parallel phases (3, 4, 5)...'
    Wait-AllBg
    Log-Ok 'Parallel phases complete'
} else {
    Log-Skip 'Phases 3+4+5 -- all already done'
}

# =============================================================================
# PHASE N (last) -- Opus: Integration pass + build
# AGENT: The final phase should always be an integration + build check.
# It scans for any missed changes and gets the build green.
# Replace {{STALE_PATTERNS}} with the actual patterns from earlier phases.
# =============================================================================
Log ''
Log '================================================'
Log 'PHASE N [Opus]: Integration + build'
Log '================================================'

if ($PN -eq 0) {
    $promptN = @"
$brief

TASK: Scan for remaining issues introduced by earlier phases, then get the build passing.

STEP 1 -- Scan src/ for stale patterns and fix any found:
  {{STALE_PATTERNS_TO_FIX}}

STEP 2 -- Run build:
  cd $PROJ
  {{BUILD_COMMAND}}
  Fix ALL type/compile errors at root cause. No suppression comments.

STEP 3 -- Verify key invariants:
  {{VERIFICATION_CHECKLIST}}
"@
    Run-Phase `
        -Label   'Phase N: Integration + build' `
        -LogFile (Join-Path $LOG 'phaseN_integrate.log') `
        -ProjPath $PROJ `
        -QodoArgs $OpusArgs `
        -Prompt $promptN
}

# =============================================================================
# Done
# =============================================================================
Log ''
Log '================================================'
Log-Ok '{{SCRIPT_NAME}}.ps1 complete!'
Log '================================================'
Log ''
# AGENT: List every phase with its label.
Log '  [OK] Phase 1  {{PHASE_1_LABEL}}'
Log '  [OK] Phase 2  {{PHASE_2_LABEL}}'
Log '  [OK] Phase 3  {{PHASE_3_LABEL}}'
Log '  [OK] Phase 4  {{PHASE_4_LABEL}}'
Log '  [OK] Phase 5  {{PHASE_5_LABEL}}'
Log '  [OK] Phase N  Integration + build passing'
Log ''
Log "All logs in $LOG`:"
Get-ChildItem -Path $LOG -Filter '*.log' | ForEach-Object { Log "  $($_.FullName)" }
