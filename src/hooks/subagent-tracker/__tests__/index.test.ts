import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  recordToolUsage,
  getAgentDashboard,
  getStaleAgents,
  getTrackingStats,
  readTrackingState,
  writeTrackingState,
  clearTrackingState,
  type SubagentInfo,
  type SubagentTrackingState,
  type ToolUsageEntry,
} from '../index.js';

describe('subagent-tracker', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `subagent-test-${Date.now()}`);
    mkdirSync(join(testDir, '.omc', 'state'), { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe('recordToolUsage', () => {
    it('should record tool usage for a running agent', () => {
      // Setup: create a running agent
      const state: SubagentTrackingState = {
        agents: [
          {
            agent_id: 'test-agent-123',
            agent_type: 'oh-my-claudecode:executor',
            started_at: new Date().toISOString(),
            parent_mode: 'ultrawork',
            status: 'running',
          },
        ],
        total_spawned: 1,
        total_completed: 0,
        total_failed: 0,
        last_updated: new Date().toISOString(),
      };
      writeTrackingState(testDir, state);

      // Record tool usage
      recordToolUsage(testDir, 'test-agent-123', 'proxy_Read', true);

      // Verify
      const updatedState = readTrackingState(testDir);
      const agent = updatedState.agents.find((a) => a.agent_id === 'test-agent-123');
      expect(agent).toBeDefined();
      expect(agent?.tool_usage).toHaveLength(1);
      expect(agent?.tool_usage?.[0].tool_name).toBe('proxy_Read');
      expect(agent?.tool_usage?.[0].success).toBe(true);
      expect(agent?.tool_usage?.[0].timestamp).toBeDefined();
    });

    it('should not record for non-existent agent', () => {
      // Setup: empty state
      const state: SubagentTrackingState = {
        agents: [],
        total_spawned: 0,
        total_completed: 0,
        total_failed: 0,
        last_updated: new Date().toISOString(),
      };
      writeTrackingState(testDir, state);

      // Try to record for non-existent agent
      recordToolUsage(testDir, 'non-existent', 'proxy_Read', true);

      // Verify state unchanged
      const updatedState = readTrackingState(testDir);
      expect(updatedState.agents).toHaveLength(0);
    });

    it('should cap tool usage at 50 entries', () => {
      // Setup: create agent with 50 tool usages
      const toolUsage: ToolUsageEntry[] = Array.from({ length: 50 }, (_, i) => ({
        tool_name: `tool-${i}`,
        timestamp: new Date().toISOString(),
        success: true,
      }));

      const state: SubagentTrackingState = {
        agents: [
          {
            agent_id: 'test-agent-123',
            agent_type: 'oh-my-claudecode:executor',
            started_at: new Date().toISOString(),
            parent_mode: 'ultrawork',
            status: 'running',
            tool_usage: toolUsage,
          },
        ],
        total_spawned: 1,
        total_completed: 0,
        total_failed: 0,
        last_updated: new Date().toISOString(),
      };
      writeTrackingState(testDir, state);

      // Add one more tool usage
      recordToolUsage(testDir, 'test-agent-123', 'new-tool', true);

      // Verify capped at 50
      const updatedState = readTrackingState(testDir);
      const agent = updatedState.agents.find((a) => a.agent_id === 'test-agent-123');
      expect(agent?.tool_usage).toHaveLength(50);
      expect(agent?.tool_usage?.[0].tool_name).toBe('tool-1'); // First one removed
      expect(agent?.tool_usage?.[49].tool_name).toBe('new-tool'); // New one added
    });

    it('should include timestamp and success flag', () => {
      // Setup: create a running agent
      const state: SubagentTrackingState = {
        agents: [
          {
            agent_id: 'test-agent-123',
            agent_type: 'oh-my-claudecode:executor',
            started_at: new Date().toISOString(),
            parent_mode: 'ultrawork',
            status: 'running',
          },
        ],
        total_spawned: 1,
        total_completed: 0,
        total_failed: 0,
        last_updated: new Date().toISOString(),
      };
      writeTrackingState(testDir, state);

      // Record failed tool usage
      const beforeTime = Date.now();
      recordToolUsage(testDir, 'test-agent-123', 'proxy_Bash', false);
      const afterTime = Date.now();

      // Verify timestamp and success
      const updatedState = readTrackingState(testDir);
      const agent = updatedState.agents.find((a) => a.agent_id === 'test-agent-123');
      expect(agent?.tool_usage).toHaveLength(1);
      const toolEntry = agent?.tool_usage?.[0];
      expect(toolEntry?.tool_name).toBe('proxy_Bash');
      expect(toolEntry?.success).toBe(false);

      const timestamp = new Date(toolEntry?.timestamp || '').getTime();
      expect(timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(timestamp).toBeLessThanOrEqual(afterTime);
    });
  });

  describe('getAgentDashboard', () => {
    it('should return empty string when no running agents', () => {
      const state: SubagentTrackingState = {
        agents: [],
        total_spawned: 0,
        total_completed: 0,
        total_failed: 0,
        last_updated: new Date().toISOString(),
      };
      writeTrackingState(testDir, state);

      const dashboard = getAgentDashboard(testDir);
      expect(dashboard).toBe('');
    });

    it('should format single running agent correctly', () => {
      const state: SubagentTrackingState = {
        agents: [
          {
            agent_id: 'abcd1234567890',
            agent_type: 'oh-my-claudecode:executor',
            started_at: new Date(Date.now() - 5000).toISOString(), // 5 seconds ago
            parent_mode: 'ultrawork',
            status: 'running',
            task_description: 'Fix the auth bug',
            tool_usage: [
              { tool_name: 'proxy_Read', timestamp: new Date().toISOString(), success: true },
              { tool_name: 'proxy_Edit', timestamp: new Date().toISOString(), success: true },
            ],
          },
        ],
        total_spawned: 1,
        total_completed: 0,
        total_failed: 0,
        last_updated: new Date().toISOString(),
      };
      writeTrackingState(testDir, state);

      const dashboard = getAgentDashboard(testDir);
      expect(dashboard).toContain('Agent Dashboard (1 active)');
      expect(dashboard).toContain('abcd123'); // Truncated agent_id
      expect(dashboard).toContain('executor'); // Stripped prefix
      expect(dashboard).toContain('tools:2');
      expect(dashboard).toContain('last:proxy_Edit');
      expect(dashboard).toContain('Fix the auth bug');
    });

    it('should format multiple (5) parallel agents', () => {
      const agents: SubagentInfo[] = Array.from({ length: 5 }, (_, i) => ({
        agent_id: `agent-${i}-123456`,
        agent_type: 'oh-my-claudecode:executor',
        started_at: new Date(Date.now() - i * 1000).toISOString(),
        parent_mode: 'ultrawork',
        status: 'running',
        task_description: `Task ${i}`,
        tool_usage: [
          { tool_name: `tool-${i}`, timestamp: new Date().toISOString(), success: true },
        ],
      }));

      const state: SubagentTrackingState = {
        agents,
        total_spawned: 5,
        total_completed: 0,
        total_failed: 0,
        last_updated: new Date().toISOString(),
      };
      writeTrackingState(testDir, state);

      const dashboard = getAgentDashboard(testDir);
      expect(dashboard).toContain('Agent Dashboard (5 active)');
      expect(dashboard).toContain('agent-0');
      expect(dashboard).toContain('agent-4');
      expect(dashboard).toContain('Task 0');
      expect(dashboard).toContain('Task 4');
    });

    it('should show tool count and last tool', () => {
      const state: SubagentTrackingState = {
        agents: [
          {
            agent_id: 'test-123',
            agent_type: 'oh-my-claudecode:architect',
            started_at: new Date().toISOString(),
            parent_mode: 'none',
            status: 'running',
            tool_usage: [
              { tool_name: 'proxy_Read', timestamp: new Date().toISOString(), success: true },
              { tool_name: 'proxy_Grep', timestamp: new Date().toISOString(), success: true },
              { tool_name: 'proxy_Bash', timestamp: new Date().toISOString(), success: false },
            ],
          },
        ],
        total_spawned: 1,
        total_completed: 0,
        total_failed: 0,
        last_updated: new Date().toISOString(),
      };
      writeTrackingState(testDir, state);

      const dashboard = getAgentDashboard(testDir);
      expect(dashboard).toContain('tools:3');
      expect(dashboard).toContain('last:proxy_Bash');
    });

    it('should detect and show stale agents warning', () => {
      const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000).toISOString();
      const state: SubagentTrackingState = {
        agents: [
          {
            agent_id: 'stale-agent',
            agent_type: 'oh-my-claudecode:executor',
            started_at: sixMinutesAgo,
            parent_mode: 'ultrawork',
            status: 'running',
          },
          {
            agent_id: 'fresh-agent',
            agent_type: 'oh-my-claudecode:executor',
            started_at: new Date().toISOString(),
            parent_mode: 'ultrawork',
            status: 'running',
          },
        ],
        total_spawned: 2,
        total_completed: 0,
        total_failed: 0,
        last_updated: new Date().toISOString(),
      };
      writeTrackingState(testDir, state);

      const dashboard = getAgentDashboard(testDir);
      expect(dashboard).toContain('⚠ 1 stale agent(s) detected');
    });

    it('should truncate agent_id to 7 chars', () => {
      const state: SubagentTrackingState = {
        agents: [
          {
            agent_id: 'very-long-agent-id-1234567890',
            agent_type: 'oh-my-claudecode:executor',
            started_at: new Date().toISOString(),
            parent_mode: 'ultrawork',
            status: 'running',
          },
        ],
        total_spawned: 1,
        total_completed: 0,
        total_failed: 0,
        last_updated: new Date().toISOString(),
      };
      writeTrackingState(testDir, state);

      const dashboard = getAgentDashboard(testDir);
      expect(dashboard).toContain('[very-lo]'); // First 7 chars
      expect(dashboard).not.toContain('very-long-agent-id');
    });

    it('should strip oh-my-claudecode: prefix from agent type', () => {
      const state: SubagentTrackingState = {
        agents: [
          {
            agent_id: 'test-123',
            agent_type: 'oh-my-claudecode:architect-high',
            started_at: new Date().toISOString(),
            parent_mode: 'none',
            status: 'running',
          },
        ],
        total_spawned: 1,
        total_completed: 0,
        total_failed: 0,
        last_updated: new Date().toISOString(),
      };
      writeTrackingState(testDir, state);

      const dashboard = getAgentDashboard(testDir);
      expect(dashboard).toContain('architect-high');
      expect(dashboard).not.toContain('oh-my-claudecode:architect-high');
    });
  });

  describe('getStaleAgents', () => {
    it('should return empty array for fresh agents', () => {
      const state: SubagentTrackingState = {
        agents: [
          {
            agent_id: 'fresh-1',
            agent_type: 'oh-my-claudecode:executor',
            started_at: new Date(Date.now() - 1000).toISOString(), // 1 second ago
            parent_mode: 'ultrawork',
            status: 'running',
          },
          {
            agent_id: 'fresh-2',
            agent_type: 'oh-my-claudecode:executor',
            started_at: new Date(Date.now() - 60000).toISOString(), // 1 minute ago
            parent_mode: 'ultrawork',
            status: 'running',
          },
        ],
        total_spawned: 2,
        total_completed: 0,
        total_failed: 0,
        last_updated: new Date().toISOString(),
      };

      const stale = getStaleAgents(state);
      expect(stale).toHaveLength(0);
    });

    it('should detect agents older than 5 minutes', () => {
      const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000).toISOString();
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();

      const state: SubagentTrackingState = {
        agents: [
          {
            agent_id: 'stale-1',
            agent_type: 'oh-my-claudecode:executor',
            started_at: sixMinutesAgo,
            parent_mode: 'ultrawork',
            status: 'running',
          },
          {
            agent_id: 'stale-2',
            agent_type: 'oh-my-claudecode:executor',
            started_at: tenMinutesAgo,
            parent_mode: 'ultrawork',
            status: 'running',
          },
          {
            agent_id: 'fresh',
            agent_type: 'oh-my-claudecode:executor',
            started_at: twoMinutesAgo,
            parent_mode: 'ultrawork',
            status: 'running',
          },
        ],
        total_spawned: 3,
        total_completed: 0,
        total_failed: 0,
        last_updated: new Date().toISOString(),
      };

      const stale = getStaleAgents(state);
      expect(stale).toHaveLength(2);
      expect(stale.map((a) => a.agent_id)).toContain('stale-1');
      expect(stale.map((a) => a.agent_id)).toContain('stale-2');
      expect(stale.map((a) => a.agent_id)).not.toContain('fresh');
    });

    it('should not flag completed agents as stale', () => {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

      const state: SubagentTrackingState = {
        agents: [
          {
            agent_id: 'completed',
            agent_type: 'oh-my-claudecode:executor',
            started_at: tenMinutesAgo,
            parent_mode: 'ultrawork',
            status: 'completed',
            completed_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
          },
          {
            agent_id: 'failed',
            agent_type: 'oh-my-claudecode:executor',
            started_at: tenMinutesAgo,
            parent_mode: 'ultrawork',
            status: 'failed',
            completed_at: new Date().toISOString(),
          },
          {
            agent_id: 'stale-running',
            agent_type: 'oh-my-claudecode:executor',
            started_at: tenMinutesAgo,
            parent_mode: 'ultrawork',
            status: 'running',
          },
        ],
        total_spawned: 3,
        total_completed: 1,
        total_failed: 1,
        last_updated: new Date().toISOString(),
      };

      const stale = getStaleAgents(state);
      expect(stale).toHaveLength(1);
      expect(stale[0].agent_id).toBe('stale-running');
    });
  });

  describe('getTrackingStats', () => {
    it('should return correct counts for mixed agent states', () => {
      const state: SubagentTrackingState = {
        agents: [
          {
            agent_id: 'running-1',
            agent_type: 'oh-my-claudecode:executor',
            started_at: new Date().toISOString(),
            parent_mode: 'ultrawork',
            status: 'running',
          },
          {
            agent_id: 'running-2',
            agent_type: 'oh-my-claudecode:executor',
            started_at: new Date().toISOString(),
            parent_mode: 'ultrawork',
            status: 'running',
          },
          {
            agent_id: 'completed-1',
            agent_type: 'oh-my-claudecode:executor',
            started_at: new Date().toISOString(),
            parent_mode: 'ultrawork',
            status: 'completed',
            completed_at: new Date().toISOString(),
          },
          {
            agent_id: 'failed-1',
            agent_type: 'oh-my-claudecode:executor',
            started_at: new Date().toISOString(),
            parent_mode: 'ultrawork',
            status: 'failed',
            completed_at: new Date().toISOString(),
          },
        ],
        total_spawned: 4,
        total_completed: 1,
        total_failed: 1,
        last_updated: new Date().toISOString(),
      };
      writeTrackingState(testDir, state);

      const stats = getTrackingStats(testDir);
      expect(stats.running).toBe(2);
      expect(stats.completed).toBe(1);
      expect(stats.failed).toBe(1);
      expect(stats.total).toBe(4);
    });

    it('should handle empty state', () => {
      const state: SubagentTrackingState = {
        agents: [],
        total_spawned: 0,
        total_completed: 0,
        total_failed: 0,
        last_updated: new Date().toISOString(),
      };
      writeTrackingState(testDir, state);

      const stats = getTrackingStats(testDir);
      expect(stats.running).toBe(0);
      expect(stats.completed).toBe(0);
      expect(stats.failed).toBe(0);
      expect(stats.total).toBe(0);
    });
  });
});
