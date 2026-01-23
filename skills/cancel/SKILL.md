---
name: cancel
description: Cancel any active OMC mode (autopilot, ralph, ultrawork, ultraqa)
user-invocable: true
---

# Cancel Skill

Intelligent cancellation that detects and cancels the active OMC mode.

## What It Does

Automatically detects which mode is active and cancels it:
- **Autopilot**: Stops workflow, preserves progress for resume
- **Ralph**: Stops persistence loop, clears linked ultrawork if applicable
- **Ultrawork**: Stops parallel execution (standalone or linked)
- **UltraQA**: Stops QA cycling workflow

## Usage

```
/oh-my-claudecode:cancel
```

Or say: "stop", "cancel", "abort"

## Auto-Detection

The skill checks state files to determine what's active:
- `.omc/autopilot-state.json` → Autopilot detected
- `.omc/ralph-state.json` → Ralph detected
- `.omc/ultrawork-state.json` → Ultrawork detected
- `.omc/ultraqa-state.json` → UltraQA detected

If multiple modes are active, they're cancelled in order of dependency:
1. Autopilot (includes ralph/ultraqa cleanup)
2. Ralph (includes linked ultrawork cleanup)
3. Ultrawork (standalone)
4. UltraQA (standalone)

## Force Clear All

To clear ALL state files regardless of what's active:

```
/oh-my-claudecode:cancel --force
```

Or use the `--all` alias:

```
/oh-my-claudecode:cancel --all
```

This removes all state files:
- `.omc/autopilot-state.json`
- `.omc/ralph-state.json`
- `.omc/ultrawork-state.json`
- `.omc/ultraqa-state.json`
- `~/.claude/ralph-state.json`
- `~/.claude/ultrawork-state.json`

## Implementation Steps

When you invoke this skill:

### 1. Parse Arguments

```bash
# Check for --force or --all flags
FORCE_MODE=false
if [[ "$*" == *"--force"* ]] || [[ "$*" == *"--all"* ]]; then
  FORCE_MODE=true
fi
```

### 2. Detect Active Modes

```bash
# Check which modes are active
AUTOPILOT_ACTIVE=false
RALPH_ACTIVE=false
ULTRAWORK_ACTIVE=false
ULTRAQA_ACTIVE=false

if [[ -f .omc/autopilot-state.json ]]; then
  AUTOPILOT_ACTIVE=$(cat .omc/autopilot-state.json | jq -r '.active // false')
fi

if [[ -f .omc/ralph-state.json ]]; then
  RALPH_ACTIVE=$(cat .omc/ralph-state.json | jq -r '.active // false')
fi

if [[ -f .omc/ultrawork-state.json ]]; then
  ULTRAWORK_ACTIVE=$(cat .omc/ultrawork-state.json | jq -r '.active // false')
fi

if [[ -f .omc/ultraqa-state.json ]]; then
  ULTRAQA_ACTIVE=$(cat .omc/ultraqa-state.json | jq -r '.active // false')
fi
```

### 3A. Force Mode (if --force or --all)

```bash
if [[ "$FORCE_MODE" == "true" ]]; then
  echo "FORCE CLEAR: Removing all OMC state files..."

  # Remove local state files
  rm -f .omc/autopilot-state.json
  rm -f .omc/ralph-state.json
  rm -f .omc/ultrawork-state.json
  rm -f .omc/ultraqa-state.json
  rm -f .omc/ralph-plan-state.json
  rm -f .omc/ralph-verification.json

  # Remove global state files
  rm -f ~/.claude/ralph-state.json
  rm -f ~/.claude/ultrawork-state.json

  echo "All OMC modes cleared. You are free to start fresh."
  exit 0
fi
```

### 3B. Smart Cancellation (default)

#### If Autopilot Active

Call `cancelAutopilot()` from `src/hooks/autopilot/cancel.ts:27-78`:

```bash
# Autopilot handles its own cleanup + ralph + ultraqa
# Just mark autopilot as inactive (preserves state for resume)
if [[ -f .omc/autopilot-state.json ]]; then
  # Clean up ralph if active
  if [[ -f .omc/ralph-state.json ]]; then
    RALPH_STATE=$(cat .omc/ralph-state.json)
    LINKED_UW=$(echo "$RALPH_STATE" | jq -r '.linked_ultrawork // false')

    # Clean linked ultrawork first
    if [[ "$LINKED_UW" == "true" ]] && [[ -f .omc/ultrawork-state.json ]]; then
      rm -f .omc/ultrawork-state.json
      rm -f ~/.claude/ultrawork-state.json
      echo "Cleaned up: ultrawork (linked to ralph)"
    fi

    # Clean ralph
    rm -f .omc/ralph-state.json
    rm -f ~/.claude/ralph-state.json
    rm -f .omc/ralph-verification.json
    echo "Cleaned up: ralph"
  fi

  # Clean up ultraqa if active
  if [[ -f .omc/ultraqa-state.json ]]; then
    rm -f .omc/ultraqa-state.json
    echo "Cleaned up: ultraqa"
  fi

  # Mark autopilot inactive but preserve state
  CURRENT_STATE=$(cat .omc/autopilot-state.json)
  CURRENT_PHASE=$(echo "$CURRENT_STATE" | jq -r '.phase // "unknown"')
  echo "$CURRENT_STATE" | jq '.active = false' > .omc/autopilot-state.json

  echo "Autopilot cancelled at phase: $CURRENT_PHASE. Progress preserved for resume."
  echo "Run /oh-my-claudecode:autopilot to resume."
fi
```

#### If Ralph Active (but not Autopilot)

Call `clearRalphState()` + `clearLinkedUltraworkState()` from `src/hooks/ralph-loop/index.ts:147-182`:

```bash
if [[ -f .omc/ralph-state.json ]]; then
  # Check if ultrawork is linked
  RALPH_STATE=$(cat .omc/ralph-state.json)
  LINKED_UW=$(echo "$RALPH_STATE" | jq -r '.linked_ultrawork // false')

  # Clean linked ultrawork first
  if [[ "$LINKED_UW" == "true" ]] && [[ -f .omc/ultrawork-state.json ]]; then
    UW_STATE=$(cat .omc/ultrawork-state.json)
    UW_LINKED=$(echo "$UW_STATE" | jq -r '.linked_to_ralph // false')

    # Only clear if it was linked to ralph
    if [[ "$UW_LINKED" == "true" ]]; then
      rm -f .omc/ultrawork-state.json
      rm -f ~/.claude/ultrawork-state.json
      echo "Cleaned up: ultrawork (linked to ralph)"
    fi
  fi

  # Clean ralph state (both local and global)
  rm -f .omc/ralph-state.json
  rm -f ~/.claude/ralph-state.json
  rm -f .omc/ralph-plan-state.json
  rm -f .omc/ralph-verification.json

  echo "Ralph cancelled. Persistent mode deactivated."
fi
```

#### If Ultrawork Active (standalone, not linked)

Call `deactivateUltrawork()` from `src/hooks/ultrawork/index.ts:150-173`:

```bash
if [[ -f .omc/ultrawork-state.json ]]; then
  # Check if linked to ralph
  UW_STATE=$(cat .omc/ultrawork-state.json)
  LINKED=$(echo "$UW_STATE" | jq -r '.linked_to_ralph // false')

  if [[ "$LINKED" == "true" ]]; then
    echo "Ultrawork is linked to Ralph. Use /oh-my-claudecode:cancel to cancel both."
    exit 1
  fi

  # Remove both local and global state
  rm -f .omc/ultrawork-state.json
  rm -f ~/.claude/ultrawork-state.json

  echo "Ultrawork cancelled. Parallel execution mode deactivated."
fi
```

#### If UltraQA Active (standalone)

Call `clearUltraQAState()` from `src/hooks/ultraqa/index.ts:107-120`:

```bash
if [[ -f .omc/ultraqa-state.json ]]; then
  rm -f .omc/ultraqa-state.json
  echo "UltraQA cancelled. QA cycling workflow stopped."
fi
```

#### No Active Modes

```bash
echo "No active OMC modes detected."
echo ""
echo "Checked for:"
echo "  - Autopilot (.omc/autopilot-state.json)"
echo "  - Ralph (.omc/ralph-state.json)"
echo "  - Ultrawork (.omc/ultrawork-state.json)"
echo "  - UltraQA (.omc/ultraqa-state.json)"
echo ""
echo "Use --force to clear all state files anyway."
```

## Complete Implementation

Here's the complete bash implementation you should run:

```bash
#!/bin/bash

# Parse arguments
FORCE_MODE=false
if [[ "$*" == *"--force"* ]] || [[ "$*" == *"--all"* ]]; then
  FORCE_MODE=true
fi

# Force mode: clear everything
if [[ "$FORCE_MODE" == "true" ]]; then
  echo "FORCE CLEAR: Removing all OMC state files..."

  mkdir -p .omc ~/.claude

  # Remove local state files
  rm -f .omc/autopilot-state.json
  rm -f .omc/ralph-state.json
  rm -f .omc/ultrawork-state.json
  rm -f .omc/ultraqa-state.json
  rm -f .omc/ralph-plan-state.json
  rm -f .omc/ralph-verification.json

  # Remove global state files
  rm -f ~/.claude/ralph-state.json
  rm -f ~/.claude/ultrawork-state.json

  echo ""
  echo "All OMC modes cleared. You are free to start fresh."
  exit 0
fi

# Track what we cancelled
CANCELLED_ANYTHING=false

# 1. Check Autopilot (highest priority, includes cleanup of ralph/ultraqa)
if [[ -f .omc/autopilot-state.json ]]; then
  AUTOPILOT_STATE=$(cat .omc/autopilot-state.json)
  AUTOPILOT_ACTIVE=$(echo "$AUTOPILOT_STATE" | jq -r '.active // false')

  if [[ "$AUTOPILOT_ACTIVE" == "true" ]]; then
    CURRENT_PHASE=$(echo "$AUTOPILOT_STATE" | jq -r '.phase // "unknown"')
    CLEANED_UP=()

    # Clean up ralph if active
    if [[ -f .omc/ralph-state.json ]]; then
      RALPH_STATE=$(cat .omc/ralph-state.json)
      RALPH_ACTIVE=$(echo "$RALPH_STATE" | jq -r '.active // false')

      if [[ "$RALPH_ACTIVE" == "true" ]]; then
        LINKED_UW=$(echo "$RALPH_STATE" | jq -r '.linked_ultrawork // false')

        # Clean linked ultrawork first
        if [[ "$LINKED_UW" == "true" ]] && [[ -f .omc/ultrawork-state.json ]]; then
          rm -f .omc/ultrawork-state.json
          rm -f ~/.claude/ultrawork-state.json
          CLEANED_UP+=("ultrawork")
        fi

        # Clean ralph
        rm -f .omc/ralph-state.json
        rm -f ~/.claude/ralph-state.json
        rm -f .omc/ralph-verification.json
        CLEANED_UP+=("ralph")
      fi
    fi

    # Clean up ultraqa if active
    if [[ -f .omc/ultraqa-state.json ]]; then
      ULTRAQA_STATE=$(cat .omc/ultraqa-state.json)
      ULTRAQA_ACTIVE=$(echo "$ULTRAQA_STATE" | jq -r '.active // false')

      if [[ "$ULTRAQA_ACTIVE" == "true" ]]; then
        rm -f .omc/ultraqa-state.json
        CLEANED_UP+=("ultraqa")
      fi
    fi

    # Mark autopilot inactive but preserve state for resume
    echo "$AUTOPILOT_STATE" | jq '.active = false' > .omc/autopilot-state.json

    echo "Autopilot cancelled at phase: $CURRENT_PHASE."

    if [[ ${#CLEANED_UP[@]} -gt 0 ]]; then
      echo "Cleaned up: ${CLEANED_UP[*]}"
    fi

    echo "Progress preserved for resume. Run /oh-my-claudecode:autopilot to continue."
    CANCELLED_ANYTHING=true
    exit 0
  fi
fi

# 2. Check Ralph (if not handled by autopilot)
if [[ -f .omc/ralph-state.json ]]; then
  RALPH_STATE=$(cat .omc/ralph-state.json)
  RALPH_ACTIVE=$(echo "$RALPH_STATE" | jq -r '.active // false')

  if [[ "$RALPH_ACTIVE" == "true" ]]; then
    LINKED_UW=$(echo "$RALPH_STATE" | jq -r '.linked_ultrawork // false')

    # Clean linked ultrawork first
    if [[ "$LINKED_UW" == "true" ]] && [[ -f .omc/ultrawork-state.json ]]; then
      UW_STATE=$(cat .omc/ultrawork-state.json)
      UW_LINKED=$(echo "$UW_STATE" | jq -r '.linked_to_ralph // false')

      # Only clear if it was linked to ralph
      if [[ "$UW_LINKED" == "true" ]]; then
        rm -f .omc/ultrawork-state.json
        rm -f ~/.claude/ultrawork-state.json
        echo "Cleaned up: ultrawork (linked to ralph)"
      fi
    fi

    # Clean ralph state (both local and global)
    rm -f .omc/ralph-state.json
    rm -f ~/.claude/ralph-state.json
    rm -f .omc/ralph-plan-state.json
    rm -f .omc/ralph-verification.json

    echo "Ralph cancelled. Persistent mode deactivated."
    CANCELLED_ANYTHING=true
    exit 0
  fi
fi

# 3. Check Ultrawork (standalone, not linked)
if [[ -f .omc/ultrawork-state.json ]]; then
  UW_STATE=$(cat .omc/ultrawork-state.json)
  UW_ACTIVE=$(echo "$UW_STATE" | jq -r '.active // false')

  if [[ "$UW_ACTIVE" == "true" ]]; then
    LINKED=$(echo "$UW_STATE" | jq -r '.linked_to_ralph // false')

    if [[ "$LINKED" == "true" ]]; then
      echo "Warning: Ultrawork is linked to Ralph, but Ralph is not active."
      echo "Clearing ultrawork state anyway..."
    fi

    # Remove both local and global state
    rm -f .omc/ultrawork-state.json
    rm -f ~/.claude/ultrawork-state.json

    echo "Ultrawork cancelled. Parallel execution mode deactivated."
    CANCELLED_ANYTHING=true
    exit 0
  fi
fi

# 4. Check UltraQA (standalone)
if [[ -f .omc/ultraqa-state.json ]]; then
  ULTRAQA_STATE=$(cat .omc/ultraqa-state.json)
  ULTRAQA_ACTIVE=$(echo "$ULTRAQA_STATE" | jq -r '.active // false')

  if [[ "$ULTRAQA_ACTIVE" == "true" ]]; then
    rm -f .omc/ultraqa-state.json
    echo "UltraQA cancelled. QA cycling workflow stopped."
    CANCELLED_ANYTHING=true
    exit 0
  fi
fi

# No active modes found
if [[ "$CANCELLED_ANYTHING" == "false" ]]; then
  echo "No active OMC modes detected."
  echo ""
  echo "Checked for:"
  echo "  - Autopilot (.omc/autopilot-state.json)"
  echo "  - Ralph (.omc/ralph-state.json)"
  echo "  - Ultrawork (.omc/ultrawork-state.json)"
  echo "  - UltraQA (.omc/ultraqa-state.json)"
  echo ""
  echo "Use --force to clear all state files anyway."
fi
```

## Messages Reference

| Mode | Success Message |
|------|-----------------|
| Autopilot | "Autopilot cancelled at phase: {phase}. Progress preserved for resume." |
| Ralph | "Ralph cancelled. Persistent mode deactivated." |
| Ultrawork | "Ultrawork cancelled. Parallel execution mode deactivated." |
| UltraQA | "UltraQA cancelled. QA cycling workflow stopped." |
| Force | "All OMC modes cleared. You are free to start fresh." |
| None | "No active OMC modes detected." |

## What Gets Preserved

| Mode | State Preserved | Resume Command |
|------|-----------------|----------------|
| Autopilot | Yes (phase, files, spec, plan, verdicts) | `/oh-my-claudecode:autopilot` |
| Ralph | No | N/A |
| Ultrawork | No | N/A |
| UltraQA | No | N/A |

## Notes

- **Dependency-aware**: Autopilot cancellation cleans up Ralph and UltraQA
- **Link-aware**: Ralph cancellation cleans up linked Ultrawork
- **Safe**: Only clears linked Ultrawork, preserves standalone Ultrawork
- **Dual-location**: Clears both `.omc/` and `~/.claude/` state files
- **Resume-friendly**: Autopilot state is preserved for seamless resume
