/**
 * Codex MCP Server - In-process MCP server for OpenAI Codex CLI integration
 *
 * Exposes `ask_codex` tool via the Claude Agent SDK's createSdkMcpServer helper.
 * Tools will be available as mcp__x__ask_codex
 *
 * Note: The standalone version (codex-standalone-server.ts) is used for the
 * external-process .mcp.json registration with proper stdio transport.
 */

import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { spawn } from 'child_process';
import { readFileSync } from 'fs';
import { detectCodexCli } from './cli-detection.js';
import { resolveSystemPrompt, buildPromptWithSystemContext } from './prompt-injection.js';

// Default model can be overridden via environment variable
const CODEX_DEFAULT_MODEL = process.env.OMC_CODEX_DEFAULT_MODEL || 'gpt-5.2';
const CODEX_TIMEOUT = parseInt(process.env.OMC_CODEX_TIMEOUT || '60000', 10);

// Codex is best for analytical/planning tasks
const CODEX_VALID_ROLES = ['architect', 'planner', 'critic', 'code-reviewer', 'code-reviewer-low', 'security-reviewer', 'security-reviewer-low'] as const;

/**
 * Parse Codex JSONL output to extract the final text response
 */
function parseCodexOutput(output: string): string {
  const lines = output.trim().split('\n').filter(l => l.trim());
  const messages: string[] = [];

  for (const line of lines) {
    try {
      const event = JSON.parse(line);
      // Look for message events with text content
      if (event.type === 'message' && event.content) {
        if (typeof event.content === 'string') {
          messages.push(event.content);
        } else if (Array.isArray(event.content)) {
          for (const part of event.content) {
            if (part.type === 'text' && part.text) {
              messages.push(part.text);
            }
          }
        }
      }
      // Also handle output_text events
      if (event.type === 'output_text' && event.text) {
        messages.push(event.text);
      }
    } catch {
      // Skip non-JSON lines (progress indicators, etc.)
    }
  }

  return messages.join('\n') || output; // Fallback to raw output
}

/**
 * Execute Codex CLI command and return the response
 */
function executeCodex(prompt: string, model: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = ['exec', '-m', model, '--json', '--full-auto'];
    const child = spawn('codex', args, {
      timeout: CODEX_TIMEOUT,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0 || stdout.trim()) {
        resolve(parseCodexOutput(stdout));
      } else {
        reject(new Error(`Codex exited with code ${code}: ${stderr || 'No output'}`));
      }
    });

    child.on('error', (err) => {
      reject(new Error(`Failed to spawn Codex CLI: ${err.message}`));
    });

    // Pipe prompt via stdin to avoid OS argument length limits
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

// Define the ask_codex tool using the SDK tool() helper
const askCodexTool = tool(
  "ask_codex",
  "Send a prompt to OpenAI Codex CLI for analytical/planning tasks. Codex excels at architecture review, planning validation, critical analysis, and code/security review validation. Requires agent_role to specify the perspective (architect, planner, critic, code-reviewer, code-reviewer-low, security-reviewer, or security-reviewer-low). Requires Codex CLI (npm install -g @openai/codex).",
  {
    prompt: { type: "string", description: "The prompt to send to Codex" },
    agent_role: { type: "string", description: `Required. Agent perspective for Codex: ${CODEX_VALID_ROLES.join(', ')}. Codex is optimized for analytical/planning tasks.` },
    model: { type: "string", description: `Codex model to use (default: ${CODEX_DEFAULT_MODEL}). Set OMC_CODEX_DEFAULT_MODEL env var to change default.` },
    context_files: { type: "array", items: { type: "string" }, description: "File paths to include as context (contents will be prepended to prompt)" },
  } as any,
  async (args: any) => {
    const { prompt, agent_role, model = CODEX_DEFAULT_MODEL, context_files } = args as {
      prompt: string;
      agent_role: string;
      model?: string;
      context_files?: string[];
    };

    // Validate agent_role
    if (!agent_role || !(CODEX_VALID_ROLES as readonly string[]).includes(agent_role)) {
      return {
        content: [{
          type: 'text' as const,
          text: `Invalid agent_role: "${agent_role}". Codex requires one of: ${CODEX_VALID_ROLES.join(', ')}`
        }]
      };
    }

    // Check CLI availability
    const detection = detectCodexCli();
    if (!detection.available) {
      return {
        content: [{
          type: 'text' as const,
          text: `Codex CLI is not available: ${detection.error}\n\n${detection.installHint}`
        }]
      };
    }

    // Resolve system prompt from agent role
    const resolvedSystemPrompt = resolveSystemPrompt(undefined, agent_role);

    // Build file context
    let fileContext: string | undefined;
    if (context_files && context_files.length > 0) {
      fileContext = context_files.map(f => {
        try {
          return `--- File: ${f} ---\n${readFileSync(f, 'utf-8')}`;
        } catch (err) {
          return `--- File: ${f} --- (Error reading: ${(err as Error).message})`;
        }
      }).join('\n\n');
    }

    // Combine: system prompt > file context > user prompt
    const fullPrompt = buildPromptWithSystemContext(prompt, fileContext, resolvedSystemPrompt);

    try {
      const response = await executeCodex(fullPrompt, model);
      return {
        content: [{
          type: 'text' as const,
          text: response
        }]
      };
    } catch (err) {
      return {
        content: [{
          type: 'text' as const,
          text: `Codex CLI error: ${(err as Error).message}`
        }]
      };
    }
  }
);

/**
 * In-process MCP server exposing Codex CLI integration
 *
 * Tools will be available as mcp__x__ask_codex
 */
export const codexMcpServer = createSdkMcpServer({
  name: "x",
  version: "1.0.0",
  tools: [askCodexTool]
});

/**
 * Tool names for allowedTools configuration
 */
export const codexToolNames = ['ask_codex'];
