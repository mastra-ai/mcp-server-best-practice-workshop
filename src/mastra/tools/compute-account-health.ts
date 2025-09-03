import { z } from "zod";
import { createTool } from "@mastra/core/tools";
import { authenticateRequest, requireAuth } from "../mcp/utils";
import { orders, users } from "../mcp/mock-data";
import { MCPTool } from "@mastra/mcp";


const AccountHealthInput = z.object({
  segment: z.enum(["all", "inactive", "highValue"]).default("all"),
  windowDays: z.number().int().positive().max(365).default(90),
  limit: z.number().int().positive().max(200).default(50),
  includeReasons: z.boolean().default(true),
});

const AccountHealthRow = z.object({
  accountId: z.string(),
  name: z.string(),
  healthScore: z.number().min(0).max(100),
  tier: z.enum(["good", "watch", "at_risk"]),
  metrics: z.object({
    lastOrderDays: z.number().int().nonnegative(),
    orderCountWindow: z.number().int().nonnegative(),
    spendWindow: z.number().nonnegative(),
    spendPrevWindow: z.number().nonnegative(),
    spendDeltaPct: z.number(), // -100..+∞
    nps: z.number().nullable(), // from external system
    openP1Tickets: z.number().int().nonnegative(), // external
    slaBreachesWindow: z.number().int().nonnegative(), // external
  }),
  reasons: z.array(z.string()).optional(),
});
const AccountHealthOutput = z.array(AccountHealthRow);

// ---- Mock External Systems (simulating real integrations) ----
async function fetchNpsByAccount(
  accountIds: string[],
): Promise<Record<string, number | null>> {
  // Simulate NPS API call with realistic delays and some missing data
  await new Promise((resolve) => setTimeout(resolve, 50 + Math.random() * 100));

  return Object.fromEntries(
    accountIds.map((id) => {
      const userId = parseInt(id);
      // Some users don't have NPS data (20% chance)
      if (Math.random() < 0.2) return [id, null];

      // Generate realistic NPS scores based on user activity patterns
      const baseScore = 50 + (userId % 40) - 20; // Range: 30-70
      const variation = (Math.random() - 0.5) * 20; // ±10 variation
      return [
        id,
        Math.max(0, Math.min(100, Math.round(baseScore + variation))),
      ];
    }),
  );
}

async function fetchSupportSignals(
  accountIds: string[],
  sinceIso: string,
): Promise<
  Record<string, { openP1Tickets: number; slaBreachesWindow: number }>
> {
  // Simulate support system API call
  await new Promise((resolve) => setTimeout(resolve, 30 + Math.random() * 70));

  return Object.fromEntries(
    accountIds.map((id) => {
      const userId = parseInt(id);
      // Higher-ID users tend to have more support issues (simulating enterprise customers)
      const riskFactor = userId > 15 ? 2 : 1;
      return [
        id,
        {
          openP1Tickets:
            Math.random() < 0.1 * riskFactor ? Math.ceil(Math.random() * 3) : 0,
          slaBreachesWindow:
            Math.random() < 0.15 * riskFactor
              ? Math.ceil(Math.random() * 2)
              : 0,
        },
      ];
    }),
  );
}

// ---- Account Health Scoring Logic ----
function scoreAccount(m: z.infer<typeof AccountHealthRow>["metrics"]): {
  score: number;
  tier: "good" | "watch" | "at_risk";
  reasons: string[];
} {
  const reasons: string[] = [];
  const clamp = (v: number, lo: number, hi: number) =>
    Math.max(lo, Math.min(hi, v));

  // Signals (normalize to 0..100)
  const recency = clamp(100 - m.lastOrderDays, 0, 100); // more recent = better
  const momentum = clamp((m.spendDeltaPct + 100) / 2, 0, 100); // -100% => 0, +100% => 100
  const satisfaction = m.nps == null ? 50 : clamp(m.nps, 0, 100); // missing => neutral
  const reliabilityPenalty = clamp(
    100 - (m.openP1Tickets * 25 + m.slaBreachesWindow * 15),
    0,
    100,
  );

  // Weighted score
  const score = clamp(
    recency * 0.3 +
      momentum * 0.3 +
      satisfaction * 0.25 +
      reliabilityPenalty * 0.15,
    0,
    100,
  );

  // Reasons (deterministic, policy-like)
  if (m.lastOrderDays > 60) reasons.push("No recent orders (>60 days)");
  if (m.spendDeltaPct < -30) reasons.push("Spend down >30% vs prior window");
  if ((m.nps ?? 50) < 30) reasons.push("Low NPS score");
  if (m.openP1Tickets > 0)
    reasons.push(`${m.openP1Tickets} open P1 support ticket(s)`);
  if (m.slaBreachesWindow > 0)
    reasons.push(`${m.slaBreachesWindow} recent SLA breach(es)`);
  if (m.orderCountWindow === 0) reasons.push("No orders in analysis window");

  const tier = score >= 75 ? "good" : score >= 50 ? "watch" : "at_risk";
  return { score, tier, reasons };
}
// --- Tool 2: compute_account_health (workflow combining multiple systems) ---
export const computeAccountHealthTool = createTool({
  id: "compute_account_health",
  description:
    "Analyze customer health by combining order data with external signals (NPS, support). Returns risk scores, segments, and actionable insights. Demonstrates multi-system workflow patterns.",
  inputSchema: AccountHealthInput,
  outputSchema: z.object({
    accounts: AccountHealthOutput,
    summary: z.object({
      totalAnalyzed: z.number(),
      segmentBreakdown: z.record(z.number()),
      avgHealthScore: z.number(),
      externalDataCoverage: z.object({
        npsAvailable: z.number(),
        supportDataAvailable: z.number(),
      }),
    }),
  }),
  // @ts-expect-error TODO MCPTool type is not compatible with createTool
  execute: (async (context, options) => {

    console.log("context-compute-account-health", context);
    console.log("options-compute-account-health", options);

    try {
      const auth = authenticateRequest(options);
      requireAuth(auth, "read:users");

      const { segment, windowDays, limit, includeReasons } = context.context;

      console.error(
        `[compute_account_health] Authenticated as: ${auth.user?.username} (${auth.user?.role})`,
      );
      console.error(
        `[compute_account_health] Analyzing segment: ${segment}, window: ${windowDays} days, limit: ${limit}`,
      );

      // Compute time windows (current vs previous of equal length)
      const now = new Date();
      const since = new Date(now.getTime() - windowDays * 24 * 3600 * 1000);
      const prevSince = new Date(
        since.getTime() - windowDays * 24 * 3600 * 1000,
      );

      // Step 1: Aggregate per-account metrics from order data
      const metrics = users.map((user) => {
        // Find last order date
        const userOrders = orders.filter((o) => o.user_id === user.id);
        const lastOrder =
          userOrders.length > 0
            ? Math.max(...userOrders.map((o) => new Date(o.created).getTime()))
            : 0;
        const lastOrderDays =
          lastOrder > 0
            ? Math.floor((now.getTime() - lastOrder) / (24 * 3600 * 1000))
            : 999;

        // Current window metrics
        const windowOrders = userOrders.filter(
          (o) => new Date(o.created).getTime() >= since.getTime(),
        );
        const orderCountWindow = windowOrders.length;
        const spendWindow = windowOrders.reduce((sum, o) => sum + o.total, 0);

        // Previous window metrics
        const prevWindowOrders = userOrders.filter((o) => {
          const orderTime = new Date(o.created).getTime();
          return (
            orderTime >= prevSince.getTime() && orderTime < since.getTime()
          );
        });
        const spendPrevWindow = prevWindowOrders.reduce(
          (sum, o) => sum + o.total,
          0,
        );

        // Calculate spend delta percentage
        const spendDeltaPct =
          spendWindow === 0 && spendPrevWindow === 0
            ? 0
            : ((spendWindow - spendPrevWindow) / (spendPrevWindow || 1)) * 100;

        return {
          accountId: String(user.id),
          name: user.name,
          core: {
            lastOrderDays,
            orderCountWindow,
            spendWindow,
            spendPrevWindow,
            spendDeltaPct,
          },
        };
      });

      // Step 2: Apply segment filtering (business logic, not just SQL)
      const filtered = metrics
        .filter((m) => {
          if (segment === "inactive") return m.core.lastOrderDays > 45;
          if (segment === "highValue") return m.core.spendWindow >= 100;
          return true; // "all"
        })
        .slice(0, 500); // Safety cap before external API calls

      console.error(
        `[compute_account_health] Filtered to ${filtered.length} accounts for analysis`,
      );

      // Step 3: Fetch external signals (NPS and support data)
      const accountIds = filtered.map((f) => f.accountId);
      console.error(
        `[compute_account_health] Fetching external data for ${accountIds.length} accounts...`,
      );

      const [npsMap, supportMap] = await Promise.all([
        fetchNpsByAccount(accountIds),
        fetchSupportSignals(accountIds, since.toISOString()),
      ]);

      // Step 4: Combine all signals and compute health scores
      const scored = filtered.map((f) => {
        const metrics = {
          lastOrderDays: f.core.lastOrderDays,
          orderCountWindow: f.core.orderCountWindow,
          spendWindow: f.core.spendWindow,
          spendPrevWindow: f.core.spendPrevWindow,
          spendDeltaPct: f.core.spendDeltaPct,
          nps: npsMap[f.accountId] ?? null,
          openP1Tickets: supportMap[f.accountId]?.openP1Tickets ?? 0,
          slaBreachesWindow: supportMap[f.accountId]?.slaBreachesWindow ?? 0,
        };

        const scoreResult = scoreAccount(metrics);

        return {
          accountId: f.accountId,
          name: f.name,
          healthScore: Math.round(scoreResult.score),
          tier: scoreResult.tier,
          metrics,
          ...(includeReasons ? { reasons: scoreResult.reasons } : {}),
        };
      });

      // Step 5: Sort by health score (worst first for action prioritization)
      scored.sort(
        (a, b) =>
          a.healthScore - b.healthScore ||
          a.accountId.localeCompare(b.accountId),
      );

      // Apply role-based limits
      const roleLimit =
        auth.user?.role === "readonly" ? Math.min(limit, 10) : limit;
      const finalResults = scored.slice(0, roleLimit);

      // Step 6: Generate summary statistics
      const segmentBreakdown = finalResults.reduce(
        (acc, account) => {
          acc[account.tier] = (acc[account.tier] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      );

      const avgHealthScore =
        finalResults.length > 0
          ? Math.round(
              finalResults.reduce((sum, a) => sum + a.healthScore, 0) /
                finalResults.length,
            )
          : 0;

      const npsAvailable = Object.values(npsMap).filter(
        (v) => v !== null,
      ).length;
      const supportDataAvailable = Object.keys(supportMap).length;

      console.error(
        `[compute_account_health] Completed analysis: ${finalResults.length} accounts, avg score: ${avgHealthScore}`,
      );

      return {
        accounts: finalResults,
        summary: {
          totalAnalyzed: finalResults.length,
          segmentBreakdown,
          avgHealthScore,
          externalDataCoverage: {
            npsAvailable,
            supportDataAvailable,
          },
        },
      };
    } catch (error) {
      // Return structured error response instead of throwing
      console.error(`[compute_account_health] Error: ${error}`);
      return {
        accounts: [],
        summary: {
          totalAnalyzed: 0,
          segmentBreakdown: {},
          avgHealthScore: 0,
          externalDataCoverage: {
            npsAvailable: 0,
            supportDataAvailable: 0,
          },
        },
      };
    }
  }) as MCPTool<typeof AccountHealthInput>["execute"],
});
