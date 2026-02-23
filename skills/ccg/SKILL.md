---
name: ccg
description: Claude-Codex-Gemini tri-model orchestration - fans out backend tasks to Codex and frontend/UI tasks to Gemini in parallel, then Claude synthesizes results
---

# CCG - Claude-Codex-Gemini Tri-Model Orchestration

CCG spawns a tmux team with Codex and Gemini CLI workers running in parallel panes, then Claude synthesizes the results. Use this for tasks that benefit from multiple AI perspectives simultaneously.

## When to Use

- Backend/analysis + frontend/UI work that can run truly in parallel
- Code review from multiple perspectives (architecture + style simultaneously)
- Research tasks where different models have complementary strengths
- Any task you want to split across Codex (analytical) and Gemini (design/creative) workers

## Requirements

- **Codex CLI**: `npm install -g @openai/codex` (or `@openai/codex`)
- **Gemini CLI**: `npm install -g @google/gemini-cli`
- **tmux**: Must be running inside a tmux session
- If either CLI is unavailable, CCG falls back to Claude-only execution

## How It Works

```
1. Claude decomposes the request into:
   - Backend/analytical tasks → Codex worker
   - Frontend/UI/design tasks → Gemini worker

2. mcp__team__omc_run_team_start creates a tmux session with 2 workers:
   omc-team-{name}
   ├── Leader pane (Claude orchestrates)
   ├── Worker pane 1: codex CLI (analytical tasks)
   └── Worker pane 2: gemini CLI (design tasks)

3. Workers read tasks from inbox files and write done.json on completion

4. mcp__team__omc_run_team_wait blocks until all workers finish

5. Claude reads taskResults and synthesizes into final output
```

## Execution Protocol

When invoked, Claude MUST follow this workflow:

### 1. Decompose Request
Split the user's request into:
- **Codex tasks**: code analysis, architecture review, backend logic, security review, test strategy
- **Gemini tasks**: UI/UX design, documentation, visual analysis, large-context file review
- **Synthesis task**: Claude combines results (always done by Claude, not delegated)

Choose a short `teamName` slug (e.g., `ccg-auth-review`).

### 2. Start the team (non-blocking)

Call `mcp__team__omc_run_team_start` — spawns workers in the background and returns a `jobId` immediately:

```
mcp__team__omc_run_team_start({
  "teamName": "ccg-{slug}",
  "agentTypes": ["codex", "gemini"],
  "tasks": [
    {"subject": "Codex task: ...", "description": "Full description of analytical work..."},
    {"subject": "Gemini task: ...", "description": "Full description of design/UI work..."}
  ],
  "cwd": "{cwd}",
  "timeoutSeconds": 300
})
```

Returns: `{ "jobId": "omc-...", "pid": 12345, "message": "Team started in background..." }`

### 3. Wait for completion

Call `mcp__team__omc_run_team_wait` — blocks internally until done:

```
mcp__team__omc_run_team_wait({
  "job_id": "{jobId}",
  "timeout_ms": 60000
})
```

> **Timeout guidance:** Use `60000` (60 s) as default. On timeout, workers keep running.
> Call `omc_run_team_wait` again to keep waiting, or `omc_run_team_cleanup` to cancel.

Returns when done:
```json
{
  "status": "completed|failed|timeout",
  "result": {
    "taskResults": [
      {"taskId": "1", "status": "completed", "summary": "..."},
      {"taskId": "2", "status": "completed", "summary": "..."}
    ]
  }
}
```

### 4. Synthesize Results

Parse `result.taskResults` and synthesize Codex + Gemini outputs into a unified response for the user.

## Fallback (CLIs Not Available)

CLI availability is checked by the MCP runtime automatically. If a CLI is not installed, the worker exits with `command not found`. In that case, fall back to Claude Task agents:

```
[CCG] Codex/Gemini CLI not found. Falling back to Claude-only execution.
```

Use standard Claude Task agents instead:
- `Task(subagent_type="oh-my-claudecode:executor", model="sonnet", ...)` for analytical tasks
- `Task(subagent_type="oh-my-claudecode:designer", model="sonnet", ...)` for design tasks

## Invocation

```
/oh-my-claudecode:ccg [task description]
```

Example:
```
/oh-my-claudecode:ccg Review this PR - check architecture and code quality (Codex) and UI components (Gemini)
```
