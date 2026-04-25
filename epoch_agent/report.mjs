// Report formatter for Pool Ranger epoch agent.
// Produces a human-readable delegation recommendation report for the administrator.
// The administrator reviews this and manually executes any changes via _delegate.mjs.

import { Rec, ClassType } from './classify.mjs';

function ada(n) {
  return (n / 1_000_000).toFixed(2) + ' M ADA';
}

function pct(n) {
  return n.toFixed(2) + ' %/yr';
}

function line(char = '-', len = 60) {
  return char.repeat(len);
}

// formatReport — produces the full text report.
//
// reportData: {
//   epochNo:              number,
//   r:                    number,
//   sSat:                 number (ADA),
//   rangerTotalStakeAda:  number,
//   rangerAvailableAda:   number,
//   classifications:      ClassificationResult[],
//   allocation:           Map<poolId, { addAda, totalAfterAda, roaAtTotal }>,
//   weightedRoaBefore:    number,
//   weightedRoaAfter:     number,
//   generatedAt:          string (ISO),
//   undeployedAda:        number,
// }
//
// Returns: string
export function formatReport(reportData) {
  const {
    epochNo, r, sSat,
    rangerTotalStakeAda, rangerAvailableAda,
    classifications,
    allocation,
    weightedRoaBefore, weightedRoaAfter,
    generatedAt,
    undeployedAda,
  } = reportData;

  const lines = [];

  const push  = (...ss) => ss.forEach(s => lines.push(s));
  const blank = ()      => lines.push('');

  // ── Header ────────────────────────────────────────────────────────────────
  push(`Pool Ranger Delegation Report — Epoch ${epochNo}`);
  push(line('='));
  push(`Generated: ${generatedAt}`);
  push(`r = ${r.toFixed(6)}  |  S_sat ≈ ${ada(sSat)}  |  Pool Ranger stake: ${ada(rangerTotalStakeAda)}`);
  push(`Available to deploy: ${ada(rangerAvailableAda)}`);
  blank();

  // Split classifications by recommendation
  const holding    = classifications.filter(c => c.recommendation === Rec.HOLD);
  const withdraws  = classifications.filter(c => c.recommendation === Rec.WITHDRAW);
  const delegates  = classifications.filter(c => c.recommendation === Rec.DELEGATE);
  const avoids     = classifications.filter(c => c.recommendation === Rec.AVOID);
  const perfFailed = classifications.filter(c =>
    c.recommendation === Rec.AVOID && c.classType === ClassType.ALL_GREEN && !c.perfPasses
  );
  const solicit    = classifications.filter(c => c.solicitCandidate)
    .sort((a, b) => a.roaAtCurrent - b.roaAtCurrent);

  // ── Existing Delegations (HOLD + WITHDRAW) ────────────────────────────────
  const existing = [...holding, ...withdraws];
  if (existing.length > 0) {
    push('EXISTING DELEGATIONS');
    push(line());
    for (const c of existing) {
      push(formatPool(c, allocation));
      blank();
    }
  }

  // ── New Candidates (DELEGATE) ─────────────────────────────────────────────
  if (delegates.length > 0) {
    push('NEW CANDIDATES');
    push(line());
    for (const c of delegates) {
      push(formatPool(c, allocation));
      blank();
    }
  }

  // ── Avoid (not currently delegating, not safe to start) ──────────────────
  const avoidNonPerf = avoids.filter(c => c.classType !== ClassType.ALL_GREEN || c.perfPasses === false);
  const avoidSafety  = avoids.filter(c =>
    (c.classType === ClassType.ALL_RED) ||
    (c.classType === ClassType.HAS_RED_ZONE && !c.canClearTrough && !c.cursorPastTrough)
  );
  if (avoidSafety.length > 0) {
    push('POOLS AVOIDED (delegation would harm SPO or cannot clear trough)');
    push(line());
    for (const c of avoidSafety) {
      push(formatPool(c, allocation));
      blank();
    }
  }

  // ── Performance failures ──────────────────────────────────────────────────
  if (perfFailed.length > 0) {
    push('POOLS DROPPED (failed 20-epoch performance filter)');
    push(line());
    for (const c of perfFailed) {
      const label = c.ticker ? `[${c.ticker}]` : '';
      push(`  Pool ${c.poolId.slice(0, 12)}... ${label}  P=${ada(c.pledgeAda)}, F=${c.fixedCostAda}, m=${(c.margin*100).toFixed(1)}%`);
      push(`    Performance: ${(c.perf * 100).toFixed(1)}%  (${c.perfValidEpochs} valid epochs checked)`);
      push(`    Dropped: requires 100% performance over 20 epochs for DELEGATE eligibility`);
    }
    blank();
  }

  // ── Solicitation Candidates (Phase 2 stub) ────────────────────────────────
  push('SOLICITATION CANDIDATES  (Phase 2 — outreach not yet implemented)');
  push(line());
  if (solicit.length === 0) {
    push('  None identified this epoch.');
  } else {
    push('  Delegators at these pools would benefit from joining Pool Ranger.');
    push('  Sorted by lowest delegator ROA (most in need of better options first).');
    blank();
    for (const c of solicit) {
      const label = c.ticker ? `[${c.ticker}]` : '';
      push(`  Pool ${c.poolId.slice(0, 12)}... ${label}`);
      push(`    Classification: ${c.classType}`);
      push(`    Delegator ROA: ${pct(c.roaAtCurrent)}`);
      if (c.classType === ClassType.ALL_RED) {
        push(`    Note: m=0% — SPO income falls with every delegator across full range.`);
      } else if (c.classType === ClassType.HAS_RED_ZONE) {
        push(`    Note: Cursor before trough at ${ada(c.troughExtAda)} ext. Can't clear — adding stake harms SPO.`);
      }
    }
  }
  blank();

  // ── Summary ───────────────────────────────────────────────────────────────
  push('SUMMARY');
  push(line());

  const withdrawCount   = withdraws.length;
  const withdrawAda     = withdraws.reduce((s, c) => s + c.rangerCurrentStake, 0);
  const addCount        = allocation.size;
  const addAda          = [...allocation.values()].reduce((s, e) => s + e.addAda, 0);
  const qualifyNoRoom   = delegates.filter(c => !allocation.has(c.poolId)).length;

  push(`Withdrawals:       ${withdrawCount} pool(s) — ${ada(withdrawAda)} freed`);
  push(`New delegations:   ${addCount} pool(s) — ${ada(addAda)} added`);
  if (qualifyNoRoom > 0) {
    push(`Qualifies/saturated: ${qualifyNoRoom} pool(s) qualify but are at or above saturation — no stake added`);
  }
  push(`Undeployed:        ${ada(undeployedAda)} (remaining after allocation)`);
  blank();

  if (weightedRoaBefore > 0 || weightedRoaAfter > 0) {
    push(`ROA before changes: ${pct(weightedRoaBefore)}  (weighted avg over deployed stake)`);
    push(`ROA after changes:  ${pct(weightedRoaAfter)}  (weighted avg)`);
    const delta = weightedRoaAfter - weightedRoaBefore;
    const sign  = delta >= 0 ? '+' : '';
    push(`Net ROA change:     ${sign}${pct(delta)}`);
  } else {
    push('(No deployed stake to compute weighted ROA)');
  }
  blank();

  // ── Next Steps ────────────────────────────────────────────────────────────
  push('NEXT STEPS (for administrator)');
  push(line());
  push('1. Review the recommendations above.');

  if (withdraws.length > 0) {
    push('2. Execute WITHDRAW transactions via _delegate.mjs for:');
    for (const c of withdraws) {
      const label = c.ticker ? `[${c.ticker}]` : '';
      push(`     Pool ${c.poolId.slice(0, 12)}... ${label} — withdraw ${ada(c.rangerCurrentStake)}`);
    }
  }

  if (delegates.length > 0) {
    const step = withdraws.length > 0 ? '3' : '2';
    push(`${step}. Execute ADD transactions via _delegate.mjs for:`);
    for (const [poolId, entry] of allocation) {
      const c     = classifications.find(x => x.poolId === poolId);
      const label = c?.ticker ? `[${c.ticker}]` : '';
      push(`     Pool ${poolId.slice(0, 12)}... ${label} — add ${ada(entry.addAda)}`);
    }
  }

  const n = (withdraws.length > 0 ? 1 : 0) + (delegates.length > 0 ? 1 : 0) + 2;
  push(`${n}. After submitting, record each change in ranger_state.json → inFlightChanges.`);
  push(`${n + 1}. Delegation changes take effect at epoch ${epochNo + 2} (rewards from epoch ${epochNo + 3}).`);
  push(`${n + 2}. Run this agent next epoch to track progress.`);
  blank();

  push('NOTE: Solicitation (Phase 2) not yet implemented.');
  blank();

  return lines.join('\n');
}

// Internal helper — formats a single pool section.
function formatPool(c, allocation) {
  const label      = c.ticker ? `[${c.ticker}]` : '';
  const alloc      = allocation.get(c.poolId);
  const parts      = [];

  parts.push(`Pool ${c.poolId.slice(0, 12)}...  ${label}  P=${ada(c.pledgeAda)}, F=${c.fixedCostAda} ADA, m=${(c.margin*100).toFixed(1)}%`);
  parts.push(`  Classification:    ${describeClass(c)}`);
  parts.push(`  Performance:       ${(c.perf * 100).toFixed(1)}%  (${c.perfValidEpochs} valid epochs)`);
  parts.push(`  Active stake:      ${ada(c.activeStakeAda)}  (Pool Ranger: ${ada(c.rangerCurrentStake)})`);
  parts.push(`  Delegator ROA now: ${pct(c.roaAtCurrent)}`);

  if (c.recommendation === Rec.HOLD) {
    parts.push(`  Recommendation:    HOLD`);
  } else if (c.recommendation === Rec.WITHDRAW) {
    parts.push(`  Recommendation:    WITHDRAW ${ada(c.rangerCurrentStake)}`);
    if (c.classType === ClassType.ALL_RED) {
      parts.push(`  Note:              m=0% — SPO earns less with every delegator. Withdrawing helps the SPO.`);
    } else {
      parts.push(`  Note:              Cursor before trough — withdrawing reduces harm to SPO.`);
    }
  } else if (c.recommendation === Rec.DELEGATE && alloc) {
    parts.push(`  Proposed addition: ${ada(alloc.addAda)}`);
    parts.push(`  ROA after add:     ${pct(alloc.roaAtTotal)}`);
    parts.push(`  Recommendation:    ADD ${ada(alloc.addAda)}`);
  } else if (c.recommendation === Rec.DELEGATE && !alloc) {
    parts.push(`  Recommendation:    QUALIFIES — but at or above saturation (${ada(c.activeStakeAda)} ≥ S_sat)`);
    parts.push(`  Note:              No stake can be added without over-saturating the pool.`);
  } else if (c.recommendation === Rec.AVOID) {
    parts.push(`  Recommendation:    AVOID`);
    if (!c.perfPasses) {
      parts.push(`  Reason:            Performance ${(c.perf * 100).toFixed(1)}% < 100% (last 20 epochs)`);
    } else if (c.classType === ClassType.ALL_RED) {
      parts.push(`  Reason:            m=0% — delegation harms SPO income across full range`);
    } else if (c.classType === ClassType.HAS_RED_ZONE && !c.canClearTrough) {
      parts.push(`  Reason:            Before trough (${ada(c.troughExtAda)}) — insufficient stake to clear`);
    }
  }

  return parts.join('\n');
}

function describeClass(c) {
  switch (c.classType) {
    case ClassType.ALL_GREEN:
      if (c.A <= c.fixedCostAda) return 'ALL_GREEN (pledge bonus ≤ fixed fee — always safe)';
      return `ALL_GREEN (m=${(c.margin*100).toFixed(1)}% ≥ m_min=${(c.mMinVal*100).toFixed(1)}%)`;
    case ClassType.ALL_RED:
      return 'ALL_RED (m=0% — entire curve red)';
    case ClassType.HAS_RED_ZONE:
      if (c.cursorPastTrough)
        return `HAS_RED_ZONE — cursor PAST trough at ${ada(c.troughExtAda)} ext — in green zone`;
      if (c.canClearTrough)
        return `HAS_RED_ZONE — cursor BEFORE trough — can clear (trough at ${ada(c.troughExtAda)} ext)`;
      return `HAS_RED_ZONE — cursor BEFORE trough at ${ada(c.troughExtAda)} ext — cannot clear`;
    default:
      return c.classType;
  }
}
