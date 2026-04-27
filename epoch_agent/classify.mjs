// Pool classification engine for Pool Ranger epoch agent.
// Determines whether adding Pool Ranger delegation to a pool is safe (ALL_GREEN),
// harmful (ALL_RED), or conditional on cursor position (HAS_RED_ZONE).
// Also computes performance factor using the same method as SPO_REWARD_ANALYSIS_CHART.html.

import { pledgeBonus, mMin, troughExtDeleg, delegROA } from './math.mjs';

export const ClassType = Object.freeze({
  ALL_GREEN:    'ALL_GREEN',    // no red zone — delegation is always cooperative
  ALL_RED:      'ALL_RED',     // m=0 with A>F — entire curve hurts the SPO
  HAS_RED_ZONE: 'HAS_RED_ZONE', // red zone exists; cursor position determines action
});

export const Rec = Object.freeze({
  DELEGATE: 'DELEGATE',   // add Pool Ranger stake here
  HOLD:     'HOLD',       // currently delegating, no change needed
  WITHDRAW: 'WITHDRAW',   // remove our stake (helps the SPO)
  AVOID:    'AVOID',      // not currently delegating; do not start
});

// computePerformance — port of the chart's computePerformance() function.
// Excludes epochs with < 0.5 expected blocks (small pool noise).
// Caps perf at 1.0 (lucky streaks don't inflate the factor).
//
// poolHistory: [{ epochNo, activeStakeAda, blockCnt }] sorted descending
// epochInfoMap: Map<epochNo, { activeStakeAda, blkCount }>
// windowEpochs: how many recent epochs to include (default 20 for perf gate)
//
// Returns: { perf, validEpochs, totalActual, totalExpected, epochsChecked }
export function computePerformance(poolHistory, epochInfoMap, windowEpochs = 20) {
  const slice = poolHistory.slice(0, windowEpochs);
  let totalExpected = 0;
  let totalActual   = 0;
  let validEpochs   = 0;

  for (const entry of slice) {
    const net = epochInfoMap.get(entry.epochNo);
    if (!net) continue;
    if (net.activeStakeAda <= 0 || net.blkCount <= 0 || entry.activeStakeAda <= 0) continue;

    const expected = (entry.activeStakeAda / net.activeStakeAda) * net.blkCount;
    if (expected < 0.5) continue;   // exclude epochs where pool is too small to matter

    totalExpected += expected;
    totalActual   += entry.blockCnt;
    validEpochs++;
  }

  if (totalExpected === 0) {
    return { perf: 1, validEpochs: 0, totalActual: 0, totalExpected: 0, epochsChecked: slice.length };
  }
  const perf = Math.min(1, totalActual / totalExpected);
  return { perf, validEpochs, totalActual, totalExpected, epochsChecked: slice.length };
}

// computeHistoricalROA — average actual delegator ROA over up to windowEpochs epochs.
//
// Unlike the projected "ROA now", this uses:
//   - each epoch's own r_i  (totalRewardsAda / networkStake, only settled epochs)
//   - each epoch's own pool activeStake (not today's)
//   - per-epoch performance WITHOUT the 1.0 cap — lucky pools show values above 100%
//
// Returns: { historicalRoa, luckPremium } in %/yr, or nulls if no settled data available.
// luckPremium = historicalRoa minus the same calculation at perf=1.0 (expected performance).
// A positive luckPremium means the pool has minted more blocks than its slot assignment expected.
export function computeHistoricalROA(poolHistory, epochInfoMap, P, F, m, windowEpochs = 20) {
  const slice = poolHistory.slice(0, windowEpochs);
  const roaValues      = [];
  const expectedValues = [];

  for (const entry of slice) {
    const net = epochInfoMap.get(entry.epochNo);
    if (!net) continue;
    if (net.totalRewardsAda == null || net.activeStakeAda <= 0 || net.blkCount <= 0) continue;
    if (entry.activeStakeAda <= 0) continue;

    const expected = (entry.activeStakeAda / net.activeStakeAda) * net.blkCount;
    if (expected < 0.5) continue;

    const r_i    = net.totalRewardsAda / net.activeStakeAda;
    const perf_i = entry.blockCnt / expected;   // intentionally uncapped
    roaValues.push(delegROA(entry.activeStakeAda, P, F, m, r_i, perf_i));
    expectedValues.push(delegROA(entry.activeStakeAda, P, F, m, r_i, 1.0));
  }

  if (roaValues.length === 0) return { historicalRoa: null, luckPremium: null };
  const historicalRoa = roaValues.reduce((a, b) => a + b, 0) / roaValues.length;
  const expectedRoa   = expectedValues.reduce((a, b) => a + b, 0) / expectedValues.length;
  return { historicalRoa, luckPremium: historicalRoa - expectedRoa };
}

// classifyPool — classify a single pool and produce a delegation recommendation.
//
// poolInfo: { poolId, ticker, name, pledgeAda, fixedCostAda, margin, activeStakeAda }
// poolHistory: [{ epochNo, activeStakeAda, blockCnt }] sorted descending
// epochInfoMap: Map<epochNo, { activeStakeAda, blkCount }>
// rangerCurrentStake: ADA Pool Ranger currently has delegated to this pool
// rangerAvailableStake: ADA Pool Ranger could add (total free - already deployed elsewhere)
// r: per-epoch reward rate (from fetchRecentR)
//
// Returns: ClassificationResult
export function classifyPool(poolInfo, poolHistory, epochInfoMap,
                              rangerCurrentStake, rangerAvailableStake, r) {
  const { poolId, pledgeAda: P, fixedCostAda: F, margin: m, activeStakeAda } = poolInfo;

  // Performance over the last 20 epochs
  const perfResult = computePerformance(poolHistory, epochInfoMap, 20);
  const { perf, validEpochs } = perfResult;
  // 100% performance required, with at least 1 valid epoch of data
  const perfPasses = validEpochs > 0 && Math.abs(perf - 1.0) < 1e-9;

  const A      = pledgeBonus(P, r, perf);
  const mMinVal = mMin(P, F, r, perf);

  // Classify
  let classType;
  if (A <= F || m >= mMinVal) {
    classType = ClassType.ALL_GREEN;
  } else if (m <= 0) {
    classType = ClassType.ALL_RED;
  } else {
    classType = ClassType.HAS_RED_ZONE;
  }

  const troughExtAda = classType === ClassType.HAS_RED_ZONE
    ? troughExtDeleg(P, F, m, r, perf)
    : (classType === ClassType.ALL_RED ? Infinity : -1);

  // External delegation excluding Pool Ranger's current stake.
  // We need the "other delegators only" position to judge cursor vs. trough.
  const totalExtAda             = activeStakeAda - P;
  const currentExtAda           = Math.max(0, totalExtAda);
  const externalExcludingRanger = Math.max(0, currentExtAda - rangerCurrentStake);

  let cursorPastTrough = false;
  let canClearTrough   = false;
  let recommendation;
  let solicitCandidate = false;

  if (classType === ClassType.ALL_RED) {
    recommendation   = rangerCurrentStake > 0 ? Rec.WITHDRAW : Rec.AVOID;
    solicitCandidate = true;

  } else if (classType === ClassType.ALL_GREEN) {
    if (rangerCurrentStake > 0) {
      recommendation = Rec.HOLD;
    } else {
      recommendation = perfPasses ? Rec.DELEGATE : Rec.AVOID;
    }

  } else {
    // HAS_RED_ZONE — evaluate cursor vs. trough
    if (externalExcludingRanger > troughExtAda) {
      // Already past trough — we're in the green zone
      cursorPastTrough = true;
      if (rangerCurrentStake > 0) {
        recommendation = Rec.HOLD;
      } else {
        recommendation = perfPasses ? Rec.DELEGATE : Rec.AVOID;
      }
    } else {
      // Before or at trough — check if we can clear it
      const stakeAfterAdd = externalExcludingRanger + rangerCurrentStake + rangerAvailableStake;
      if (stakeAfterAdd > troughExtAda) {
        canClearTrough = true;
        if (rangerCurrentStake > 0) {
          recommendation = Rec.HOLD;
        } else {
          recommendation = perfPasses ? Rec.DELEGATE : Rec.AVOID;
        }
      } else {
        // Can't clear trough — adding delegation deepens the harm
        recommendation   = rangerCurrentStake > 0 ? Rec.WITHDRAW : Rec.AVOID;
        solicitCandidate = true;
      }
    }
  }

  // ROA at current total stake and at proposed total stake
  const currentTotalStake   = activeStakeAda;
  const roaAtCurrent        = delegROA(currentTotalStake, P, F, m, r, perf);
  const { historicalRoa, luckPremium } = computeHistoricalROA(poolHistory, epochInfoMap, P, F, m, 20);

  let proposedTotalStake = currentTotalStake;
  if (recommendation === Rec.DELEGATE) {
    // Allocate as much as possible (allocate.mjs will refine the exact amount)
    // For now, record the ROA if we added our full available stake
    proposedTotalStake = currentTotalStake + rangerAvailableStake;
  } else if (recommendation === Rec.WITHDRAW) {
    proposedTotalStake = Math.max(P, currentTotalStake - rangerCurrentStake);
  }
  const roaAtProposed = delegROA(proposedTotalStake, P, F, m, r, perf);

  return {
    poolId,
    ticker:        poolInfo.ticker,
    name:          poolInfo.name,
    pledgeAda:     P,
    fixedCostAda:  F,
    margin:        m,
    activeStakeAda,
    classType,
    perf,
    perfPasses,
    perfValidEpochs: validEpochs,
    A,
    mMinVal,
    troughExtAda,
    currentExtAda,
    externalExcludingRanger,
    cursorPastTrough,
    canClearTrough,
    rangerCurrentStake,
    recommendation,
    proposedTotalStake,
    roaAtProposed,
    roaAtCurrent,
    historicalRoa,
    luckPremium,
    solicitCandidate,
  };
}
