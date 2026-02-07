---
description: N coordinated agents on shared task list using Claude Code native teams
aliases: [team-agents, team-mode]
---

# Team Command

[TEAM MODE ACTIVATED]

Spawn N coordinated agents working on a shared task list using Claude Code's native TeamCreate, SendMessage, and TaskCreate tools. Like a dev team with real-time communication—fast, reliable, and with built-in coordination.

## User's Request

{{ARGUMENTS}}

## Usage Patterns

### Standard Mode (1-5 agents)
```
/oh-my-claudecode:team N:agent-type "task description"
```

### Parameters

- **N** - Number of agents (1-5, Claude Code background task limit)
- **agent-type** - Agent to spawn (e.g., executor, build-fixer, architect)
- **task** - High-level task to decompose and distribute

### Examples

```bash
/oh-my-claudecode:team 5:executor "fix all TypeScript errors"
/oh-my-claudecode:team 3:build-fixer "fix build errors in src/"
/oh-my-claudecode:team 4:designer "implement responsive layouts for all components"
/oh-my-claudecode:team 2:architect "analyze and document all API endpoints"
```

## Architecture

```
User: "/team 5:executor fix all TypeScript errors"
              |
              v
      [TEAM ORCHESTRATOR]
              |
     TeamCreate("fix-ts-errors")
              |
    TaskCreate × N (one per subtask)
              |
   Task(team_name) × 5
              |
   +--+--+--+--+--+
   |  |  |  |  |
   v  v  v  v  v
  T1 T2 T3 T4 T5   ← teammates
   |  |  |  |  |
   TaskList → claim → work → complete
   |  |  |  |  |
   SendMessage → team lead
```

**Key Features:**
- Native Claude Code team tools (TeamCreate/SendMessage/TaskCreate)
- Real-time inter-agent messaging (DMs and broadcasts)
- Built-in task dependencies (blocks/blockedBy)
- Graceful shutdown protocol
- Zero external dependencies (no SQLite needed)

## Workflow

### 1. Parse Input

From `{{ARGUMENTS}}`, extract:
- N (agent count, validate <= 5)
- agent-type (executor, build-fixer, etc.)
- task description

### 2. Analyze & Decompose Task
- Explore codebase to understand scope
- Break into N independent subtasks
- Identify file ownership per subtask

### 3. Create Team & Tasks
- TeamCreate with descriptive name
- TaskCreate for each subtask (with dependencies if needed)

### 4. Spawn Teammates
- Launch N agents via Task tool with team_name parameter
- Each teammate: TaskList → claim → work → complete → report

### 5. Monitor & Coordinate
- Track progress via TaskList
- Receive automatic messages from teammates
- Send guidance/coordination messages as needed

### 6. Completion & Cleanup
- Verify all tasks completed
- SendMessage(shutdown_request) to each teammate
- TeamDelete to clean up

## Cancellation

Use unified cancel command:
```
/oh-my-claudecode:cancel
```

## Output

Report when complete:
- Total tasks completed
- Tasks per agent
- Total time elapsed
- Summary of changes made
