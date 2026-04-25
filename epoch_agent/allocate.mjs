// Stake allocation optimizer for Pool Ranger epoch agent.
// Distributes Pool Ranger's available ADA across DELEGATE-recommended pools
// to maximize weighted-average delegator ROA.
//
// Strategy: greedy sort by ROA at proposed delegation level.
// Respects saturation cap (sSat) and 20% concentration limit per pool.

import { delegROA } from './math.mjs';

const DEFAULT_MAX_CONCENTRATION = 0.20;   // max 20% of available stake in any one pool
const DEFAULT_MIN_MEANINGFUL    = 10_000; // ADA — don't make delegations smaller than this

// allocate — distribute available ADA across safe pools.
//
// delegateCandidates: ClassificationResult[] where recommendation === DELEGATE
// totalAvailableAda: ADA Pool Ranger has free to deploy this epoch
// sSat: current saturation point in ADA (from computeSsat)
// config: optional overrides for concentration and minimum thresholds
//
// Returns: Map<poolId, AllocationEntry>
//   AllocationEntry: { addAda, totalAfterAda, roaAtTotal }
export function allocate(delegateCandidates, totalAvailableAda, sSat, config = {}) {
  const maxConcentrationFrac = config.maxConcentrationFrac ?? DEFAULT_MAX_CONCENTRATION;
  const minMeaningfulAda     = config.minMeaningfulAda     ?? DEFAULT_MIN_MEANINGFUL;
  const result               = new Map();

  if (totalAvailableAda <= 0 || delegateCandidates.length === 0) return result;

  // Compute ROA at proposed total stake for each candidate to rank them.
  // At this point we don't know exact allocation yet, so rank by current ROA
  // (a reasonable proxy — pools with higher ROA now will tend to rank higher after).
  const ranked = delegateCandidates
    .map(pool => ({ pool, rankRoa: pool.roaAtCurrent }))
    .sort((a, b) => b.rankRoa - a.rankRoa);

  let remaining = totalAvailableAda;

  for (const { pool } of ranked) {
    if (remaining < minMeaningfulAda) break;

    const { poolId, pledgeAda: P, fixedCostAda: F, margin: m, activeStakeAda, perf } = pool;
    const { r } = pool;   // r is not stored on pool — use pool.r if we added it, otherwise need it passed

    // headroom before saturation
    const roomToSat = Math.max(0, sSat - activeStakeAda);
    if (roomToSat < minMeaningfulAda) continue;

    const maxAdd = Math.min(
      roomToSat,
      totalAvailableAda * maxConcentrationFrac,
      remaining,
    );

    if (maxAdd < minMeaningfulAda) continue;

    const totalAfterAda = activeStakeAda + maxAdd;
    const roaAtTotal    = pool.roaAtProposed;  // pre-computed in classifyPool

    result.set(poolId, { addAda: maxAdd, totalAfterAda, roaAtTotal });
    remaining -= maxAdd;
  }

  return result;
}

// allocateWithR — version that re-computes ROA accurately using r.
// Use this in run.mjs after r is known.
//
// delegateCandidates: ClassificationResult[]
// totalAvailableAda: ADA available to deploy
// sSat: saturation point in ADA
// r: epoch rate (from fetchRecentR)
// config: optional overrides
//
// Returns: Map<poolId, AllocationEntry>
export function allocateWithR(delegateCandidates, totalAvailableAda, sSat, r, config = {}) {
  const maxConcentrationFrac = config.maxConcentrationFrac ?? DEFAULT_MAX_CONCENTRATION;
  const minMeaningfulAda     = config.minMeaningfulAda     ?? DEFAULT_MIN_MEANINGFUL;
  const result               = new Map();

  if (totalAvailableAda <= 0 || delegateCandidates.length === 0) return result;

  // Sort by ROA at current stake level (descending) — greedy approximation
  const ranked = [...delegateCandidates].sort((a, b) => b.roaAtCurrent - a.roaAtCurrent);

  let remaining = totalAvailableAda;

  for (const pool of ranked) {
    if (remaining < minMeaningfulAda) break;

    const { poolId, pledgeAda: P, fixedCostAda: F, margin: m, activeStakeAda, perf } = pool;

    const roomToSat = Math.max(0, sSat - activeStakeAda);
    if (roomToSat < minMeaningfulAda) continue;

    const maxAdd = Math.min(
      roomToSat,
      totalAvailableAda * maxConcentrationFrac,
      remaining,
    );
    if (maxAdd < minMeaningfulAda) continue;

    const totalAfterAda = activeStakeAda + maxAdd;
    const roaAtTotal    = delegROA(totalAfterAda, P, F, m, r, perf);

    result.set(poolId, { addAda: maxAdd, totalAfterAda, roaAtTotal });
    remaining -= maxAdd;
  }

  return result;
}
