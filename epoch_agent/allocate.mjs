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
// NOTE: This function is kept for reference. run.mjs now uses globalAllocateWithR.
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
    const roaAtTotal    = delegROA(totalAfterAda, P, F, m, r, perf, sSat);

    result.set(poolId, { addAda: maxAdd, totalAfterAda, roaAtTotal });
    remaining -= maxAdd;
  }

  return result;
}

// globalAllocateWithR — global optimizer that re-evaluates ALL currently-delegated pools
// alongside new candidates each epoch, treating the full member stake as one unified pool.
// Every safe pool (HOLD or DELEGATE recommendation) competes for the full budget.
//
// safePools: ClassificationResult[] where recommendation is DELEGATE or HOLD
// totalBudget: ADA to redistribute (totalMemberStakeAda - pendingInFlightAdds)
// sSat: saturation point in ADA
// r: epoch rate
// config: optional overrides for concentration and minimum thresholds
//
// Returns: Map<poolId, GlobalAllocationEntry>
//   GlobalAllocationEntry: {
//     proposedAda,     // ADA Pool Ranger should have at this pool after the change
//     currentAda,      // ADA Pool Ranger currently has at this pool
//     netChangeAda,    // proposedAda - currentAda
//     roaAtProposed,   // delegROA at proposed total pool stake
//     roaAtCurrent,    // delegROA at current total pool stake
//     churnCostAda,    // opportunity cost: 2 epochs earning old ROA instead of new ROA (only when reducing)
//     breakEvenEpochs, // epochs until ROA gain repays churn cost (null if no gain)
//     moveType,        // 'HOLD' | 'ADD_NEW' | 'ADD_MORE' | 'REDUCE' | 'WITHDRAW'
//   }
export function globalAllocateWithR(safePools, totalBudget, sSat, r, config = {}) {
  const maxConcentrationFrac = config.maxConcentrationFrac ?? DEFAULT_MAX_CONCENTRATION;
  const minMeaningfulAda     = config.minMeaningfulAda     ?? DEFAULT_MIN_MEANINGFUL;
  const result               = new Map();

  if (safePools.length === 0) return result;

  // Sort by ROA at current stake (descending) — greedy rank
  const ranked  = [...safePools].sort((a, b) => b.roaAtCurrent - a.roaAtCurrent);
  const proposed = new Map(); // poolId → proposedAda
  let remaining  = Math.max(0, totalBudget);

  // ── Step 1: greedy fill ────────────────────────────────────────────────────
  for (const pool of ranked) {
    if (remaining < minMeaningfulAda) break;

    const { poolId, activeStakeAda } = pool;
    const roomToSat = Math.max(0, sSat - activeStakeAda);
    if (roomToSat < minMeaningfulAda) continue;

    const maxAdd = Math.min(
      roomToSat,
      totalBudget * maxConcentrationFrac,
      remaining,
    );
    if (maxAdd < minMeaningfulAda) continue;

    proposed.set(poolId, maxAdd);
    remaining -= maxAdd;
  }

  // ── Step 2: destination ROA (weighted avg of pools receiving stake) ────────
  // Used as the "newROA" benchmark when computing break-even for reductions.
  let totalReceived   = 0;
  let weightedDestRoa = 0;
  for (const pool of safePools) {
    const allocAda = proposed.get(pool.poolId) ?? 0;
    if (allocAda === 0) continue;
    const { pledgeAda: P, fixedCostAda: F, margin: m,
            activeStakeAda, perf, rangerCurrentStake } = pool;
    const newS = activeStakeAda - rangerCurrentStake + allocAda;
    const roa  = delegROA(newS, P, F, m, r, perf, sSat);
    totalReceived   += allocAda;
    weightedDestRoa += allocAda * roa;
  }
  const avgDestRoa = totalReceived > 0 ? weightedDestRoa / totalReceived : 0;

  // ── Step 3: build result with diffs and churn costs ───────────────────────
  for (const pool of safePools) {
    const { poolId, pledgeAda: P, fixedCostAda: F, margin: m,
            activeStakeAda, perf,
            rangerCurrentStake: currentAda,
            roaAtCurrent } = pool;

    const proposedAda = proposed.get(poolId) ?? 0;
    if (currentAda === 0 && proposedAda === 0) continue; // unfunded new candidate — omit

    const netChangeAda  = proposedAda - currentAda;
    const newS          = activeStakeAda - currentAda + proposedAda;
    const roaAtProposed = delegROA(newS, P, F, m, r, perf, sSat);

    // Determine move type
    let moveType;
    if (Math.abs(netChangeAda) < minMeaningfulAda) {
      moveType = 'HOLD';
    } else if (currentAda === 0) {
      moveType = 'ADD_NEW';
    } else if (proposedAda > currentAda) {
      moveType = 'ADD_MORE';
    } else if (proposedAda > 0) {
      moveType = 'REDUCE';
    } else {
      moveType = 'WITHDRAW';
    }

    // Opportunity cost — old-pool rewards continue during the 2-epoch transition, so no
    // rewards are missed. The only cost is earning oldROA instead of newROA for 2 epochs.
    // Break-even is always 2 epochs: cost = 2 × gain/epoch, so cost / (gain/epoch) = 2.
    let churnCostAda    = 0;
    let breakEvenEpochs = null;
    if (netChangeAda < -(minMeaningfulAda) && currentAda > 0) {
      const movedAda = Math.abs(netChangeAda);
      const roaDiff  = avgDestRoa - roaAtCurrent;
      if (roaDiff > 0) {
        churnCostAda    = 2 * movedAda * roaDiff / 73 / 100;
        breakEvenEpochs = 2;
      }
    }

    result.set(poolId, {
      proposedAda,
      currentAda,
      netChangeAda,
      roaAtProposed,
      roaAtCurrent,
      churnCostAda,
      breakEvenEpochs,
      moveType,
    });
  }

  return result;
}
