/**
 * OMC HUD - Call Counts Element
 *
 * Renders real-time counts of tool calls, agent invocations, and skill usages
 * on the right side of the HUD status line. (Issue #710)
 *
 * Format: 🔧42 🤖7 ⚡3
 */

/**
 * Render call counts badge.
 *
 * Omits a counter entirely when its count is zero to keep output terse.
 * Returns null if all counts are zero (nothing to show).
 *
 * @param toolCalls - Total tool_use blocks seen in transcript
 * @param agentInvocations - Total Task/proxy_Task calls seen in transcript
 * @param skillUsages - Total Skill/proxy_Skill calls seen in transcript
 */
export function renderCallCounts(
  toolCalls: number,
  agentInvocations: number,
  skillUsages: number,
): string | null {
  const parts: string[] = [];

  if (toolCalls > 0) {
    parts.push(`\u{1F527}${toolCalls}`); // 🔧
  }
  if (agentInvocations > 0) {
    parts.push(`\u{1F916}${agentInvocations}`); // 🤖
  }
  if (skillUsages > 0) {
    parts.push(`\u26A1${skillUsages}`); // ⚡
  }

  return parts.length > 0 ? parts.join(' ') : null;
}
