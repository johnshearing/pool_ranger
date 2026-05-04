// Pure reward math for Pool Ranger epoch agent.
// Identical to the formulas in SPO_REWARD_ANALYSIS_CHART.html — verified against
// known values in pool_avoid_explained.md and SPO_REWARD_ANALYSIS.md.
//
// Unit conventions (apply everywhere):
//   S, P, F  — ADA (not lovelace, not millions of ADA)
//   m        — fraction  (0.05 = 5%)
//   r        — fraction per epoch  (~0.000548)
//   perf     — fraction  (1.0 = 100%)
//   returns  — ADA/epoch or %/year as noted

export const A0           = 0.3;   // pledge influence parameter (protocol constant)
export const EPOCHS_PER_YR = 73;   // Cardano epochs per year

// computeSsat — saturation point in ADA
// networkActiveStakeAda: total active stake on the network (ADA)
// k: nOpt protocol parameter (currently 500)
export function computeSsat(networkActiveStakeAda, k = 500) {
  return networkActiveStakeAda / k;
}

// gross — total pool reward pot before fees and margin (ADA/epoch)
// sSat caps S at the saturation threshold; default Infinity means no cap.
export function gross(S, P, r, sSat = Infinity) {
  const S_capped = Math.min(S, sSat);
  return r * (S_capped + A0 * P) / (1 + A0);
}

// spoIncome — what the SPO keeps after fixed fee + margin + pledge share (ADA/epoch)
export function spoIncome(S, P, F, m, r, perf, sSat = Infinity) {
  if (S <= 0) return 0;
  const g = gross(S, P, r, sSat) * perf;
  if (g <= F) return g;
  const net = g - F;
  return F + m * net + (P / S) * (1 - m) * net;
}

// delegROA — annual return for delegators (%/yr, e.g. 3.04 means 3.04%)
export function delegROA(S, P, F, m, r, perf, sSat = Infinity) {
  if (S <= 0) return 0;
  const g = gross(S, P, r, sSat) * perf;
  if (g <= F) return 0;
  return (1 - m) * (g - F) / S * EPOCHS_PER_YR * 100;
}

// pledgeBonus — effective pledge bonus A_eff (ADA/epoch)
// This is the fixed amount the SPO earns solely from pledge,
// independent of external delegation.
export function pledgeBonus(P, r, perf) {
  return perf * r * A0 * P / (1 + A0);
}

// mMin — minimum margin fraction to eliminate the red zone entirely.
// Returns 0 if the pool is auto-safe (A_eff <= F at any margin).
// Ceiling is ~0.231 regardless of pledge size.
export function mMin(P, F, r, perf) {
  const A = pledgeBonus(P, r, perf);
  if (A <= F) return 0;
  const denom = perf * r * P - F;
  if (denom <= 0) return 0;
  return Math.min((A - F) / denom, 1);
}

// troughExtDeleg — external delegation at the trough (ADA).
//
// The "trough" is the external delegation level where SPO income bottoms out
// before recovering as delegation increases further (the red→green transition).
//
// Returns:
//   -1       if no trough exists (pool is ALL_GREEN: A <= F or m >= mMin)
//   Infinity if m === 0 and A > F (entire curve is red — ALL_RED)
//   ADA      external delegation at trough otherwise
//
// Note: if extAtTrough <= 0 the trough is at or before the pledge level —
// every delegator is already in the green zone; returns 0.
export function troughExtDeleg(P, F, m, r, perf) {
  const A = pledgeBonus(P, r, perf);
  if (A <= F) return -1;           // no red zone at any delegation level
  if (m <= 0) return Infinity;     // m=0: entire curve is red
  const mm = mMin(P, F, r, perf);
  if (m >= mm) return -1;          // margin is high enough — no trough
  const Sstar = Math.sqrt(P * (1 - m) * (A - F) / (m * perf * r / (1 + A0)));
  const extAtTrough = Sstar - P;
  return extAtTrough <= 0 ? 0 : extAtTrough;
}
