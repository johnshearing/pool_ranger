// Pool classification engine for Pool Ranger epoch agent.
// Determines whether adding Pool Ranger delegation to a pool is safe (ALL_GREEN),
// harmful (ALL_RED), or conditional on cursor position (HAS_RED_ZONE).
// Also computes performance factor using the same method as SPO_REWARD_ANALYSIS_CHART.html.

import { pledgeBonus, mMin, troughExtDeleg, delegROA, gross, EPOCHS_PER_YR } from './math.mjs';

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
//   - each epoch's own r_i  (totalRewardsAda / networkStake × (1+A₀), only settled epochs)
//   - each epoch's own pool activeStake (not today's)
//   - per-epoch performance WITHOUT the 1.0 cap — lucky pools show values above 100%
//
// offset: number of epochs to skip from the most-recent end of poolHistory (default 0).
//         Pass offset=20 to compute over epochs 21-40 ago, etc.
//
// Returns: { historicalRoa, luckPremium, luckZ, validEpochs } in %/yr (luckZ dimensionless σ),
// or nulls if no settled data available.
// luckPremium = historicalRoa minus the same calculation at perf=1.0 (expected performance).
// A positive luckPremium means the pool has minted more blocks than its slot assignment expected.
// luckZ = luckPremium divided by its theoretical standard error (Poisson block-assignment model).
//   |luckZ| < 1.5 → consistent with pure random variance
//   luckZ  > 1.5 consistently → likely real systematic advantage
export function computeHistoricalROA(poolHistory, epochInfoMap, P, F, m, windowEpochs = 20, offset = 0) {
  const slice = poolHistory.slice(offset, offset + windowEpochs);
  const roaValues      = [];
  const expectedValues = [];
  let sumC2overExp     = 0;  // sum of (C_i^2 / expected_i) for z-score denominator

  for (const entry of slice) {
    const net = epochInfoMap.get(entry.epochNo);
    if (!net) continue;
    if (net.totalRewardsAda == null || net.activeStakeAda <= 0 || net.blkCount <= 0) continue;
    if (entry.activeStakeAda <= 0) continue;

    const expected = (entry.activeStakeAda / net.activeStakeAda) * net.blkCount;
    if (expected < 0.5) continue;

    // Same correction as fetchRecentR: Koios total_rewards ≈ R/(1+A₀); gross() needs R/TAS.
    const r_i    = net.totalRewardsAda / net.activeStakeAda * (1 + A0);
    const perf_i = entry.blockCnt / expected;   // intentionally uncapped
    roaValues.push(delegROA(entry.activeStakeAda, P, F, m, r_i, perf_i));
    expectedValues.push(delegROA(entry.activeStakeAda, P, F, m, r_i, 1.0));

    // delegROA is exactly linear in perf when gross > F, so luck_i = C_i * (perf_i - 1).
    // Var(perf_i) = 1/expected_i (Poisson), so Var(luck_i) = C_i^2 / expected_i.
    const g_i = gross(entry.activeStakeAda, P, r_i);
    if (g_i > F) {
      const C_i = (1 - m) * g_i / entry.activeStakeAda * EPOCHS_PER_YR * 100;
      sumC2overExp += (C_i * C_i) / expected;
    }
  }

  if (roaValues.length === 0) return { historicalRoa: null, luckPremium: null, luckZ: null, validEpochs: 0 };
  const n           = roaValues.length;
  const historicalRoa = roaValues.reduce((a, b) => a + b, 0) / n;
  const expectedRoa   = expectedValues.reduce((a, b) => a + b, 0) / n;
  const luckPremium   = historicalRoa - expectedRoa;

  // Standard error of the average luck premium (std dev of the mean over n epochs).
  // se = sqrt(sum C_i^2/expected_i) / n
  const se    = sumC2overExp > 0 ? Math.sqrt(sumC2overExp) / n : 0;
  const luckZ = se > 0 ? luckPremium / se : null;

  return { historicalRoa, luckPremium, luckZ, validEpochs: roaValues.length };
}

// computeLuckZWindows — compute luckZ for non-overlapping 20-epoch windows across the pool's
// full available history. Returns a trend signal on the very first run without waiting for
// multiple agent runs to accumulate cross-run observations.
//
// poolHistory sorted descending (index 0 = most recent). Windows are labelled by how many
// epochs ago they ended, e.g. "1-20" = the 20 most recent, "21-40" = the next 20, etc.
//
// Returns: Array<{ epochsAgo, luckZ, nEpochs }>
export function computeLuckZWindows(poolHistory, epochInfoMap, P, F, m) {
  const WINDOW  = 20;
  const windows = [];
  for (let start = 0; start < poolHistory.length; start += WINDOW) {
    const end = Math.min(start + WINDOW, poolHistory.length);
    const { luckZ, validEpochs } = computeHistoricalROA(
      poolHistory, epochInfoMap, P, F, m, end - start, start,
    );
    windows.push({
      epochsAgo: `${start + 1}-${end}`,
      luckZ:     luckZ !== null ? parseFloat(luckZ.toFixed(2)) : null,
      nEpochs:   validEpochs,
    });
  }
  return windows;
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
  // 20-epoch window for historicalRoa and luckPremium (short-term signal, labelled in report)
  const { historicalRoa, luckPremium } = computeHistoricalROA(poolHistory, epochInfoMap, P, F, m, 20);
  // Full available history (up to 73 ep) for the headline luckZ — more statistically reliable
  const { luckZ, validEpochs: luckZValidEpochs } = computeHistoricalROA(poolHistory, epochInfoMap, P, F, m, 73);
  // Non-overlapping 20-epoch windows across full history — trend visible on first run
  const luckZWindows = computeLuckZWindows(poolHistory, epochInfoMap, P, F, m);

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
    luckZ,
    luckZValidEpochs,
    luckZWindows,
    solicitCandidate,
    poolAgeEpochs: poolHistory.length,
  };
}
