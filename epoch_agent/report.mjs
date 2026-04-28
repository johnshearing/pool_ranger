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

function signedPct(n) {
  return (n >= 0 ? '+' : '') + n.toFixed(2) + ' %/yr';
}

function roaLines(indent, c) {
  const L = 24;
  const luckZStr = c.luckZ != null
    ? (c.luckZ >= 0 ? '+' : '') + c.luckZ.toFixed(2) + ' σ'
    : 'n/a';
  const nEp    = c.luckZValidEpochs ?? 20;
  const ageEp  = c.poolAgeEpochs ?? null;
  const ageStr = ageEp === null
    ? 'unknown'
    : ageEp >= 73
      ? '73+ epochs'
      : `${ageEp} epochs  (less than full 73-ep window — luckZ less decisive)`;
  return [
    `${indent}${'Projected ROA:'.padEnd(L)} ${pct(c.roaAtCurrent)}`,
    `${indent}${'Historical ROA (20 ep):'.padEnd(L)} ${c.historicalRoa  !== null ? pct(c.historicalRoa)      : 'n/a'}`,
    `${indent}${'Luck premium (20 ep):'.padEnd(L)} ${c.luckPremium    !== null ? signedPct(c.luckPremium) : 'n/a'}`,
    `${indent}${`Luck z-score (${nEp} ep):`.padEnd(L)} ${luckZStr}`,
    `${indent}${'Pool age:'.padEnd(L)} ${ageStr}`,
  ];
}

function line(char = '-', len = 60) {
  return char.repeat(len);
}

function beLabel(epochs) {
  if (epochs === null) return 'n/a — no ROA gain expected';
  return `${epochs} epochs (~${Math.round(epochs * 5)} days)`;
}

// formatReport — produces the full text report.
//
// reportData: {
//   epochNo:              number,
//   r:                    number,
//   sSat:                 number (ADA),
//   rangerTotalStakeAda:  number,
//   rangerAvailableAda:   number (= globalBudget),
//   classifications:      ClassificationResult[],
//   allocation:           Map<poolId, GlobalAllocationEntry>,
//   forcedWithdrawals:    ClassificationResult[] (unsafe pools — ALL_RED or unclearable),
//   weightedRoaBefore:    number,
//   weightedRoaAfter:     number,
//   generatedAt:          string (ISO),
//   undeployedAda:        number,
//   poolLuckHistory:      object (poolId → { ticker, observations: [{epoch,luckZ,luckPremium,nEpochs}] }),
// }
//
// Returns: string
export function formatReport(reportData) {
  const {
    epochNo, r, sSat,
    rangerTotalStakeAda, rangerAvailableAda,
    classifications,
    allocation,
    forcedWithdrawals = [],
    weightedRoaBefore, weightedRoaAfter,
    generatedAt,
    undeployedAda,
    poolLuckHistory = {},
  } = reportData;

  const lines = [];
  const push  = (...ss) => ss.forEach(s => lines.push(s));
  const blank = ()      => lines.push('');

  // Build lookup map: poolId → ClassificationResult
  const classMap = new Map(classifications.map(c => [c.poolId, c]));

  // Partition allocation entries
  const existingEntries = []; // currently delegated (currentAda > 0)
  const newEntries      = []; // ADD_NEW (not previously delegated)

  for (const [poolId, entry] of allocation) {
    const c = classMap.get(poolId);
    if (!c) continue;
    if (entry.currentAda > 0) {
      existingEntries.push({ c, entry });
    } else if (entry.moveType === 'ADD_NEW') {
      newEntries.push({ c, entry });
    }
  }

  // Sort existing: HOLD first, ADD_MORE, REDUCE, WITHDRAW
  const moveOrder = { HOLD: 0, ADD_MORE: 1, REDUCE: 2, WITHDRAW: 3 };
  existingEntries.sort((a, b) =>
    (moveOrder[a.entry.moveType] ?? 4) - (moveOrder[b.entry.moveType] ?? 4)
  );

  // Sort new candidates: highest projected ROA first
  newEntries.sort((a, b) => b.c.roaAtCurrent - a.c.roaAtCurrent);

  const rebalanceMoves = existingEntries.filter(
    ({ entry }) => entry.moveType === 'REDUCE' || entry.moveType === 'WITHDRAW'
  );

  // DELEGATE pools that qualified but received no stake (saturated or budget exhausted)
  const allocatedIds = new Set(allocation.keys());
  const forcedIds    = new Set(forcedWithdrawals.map(c => c.poolId));
  const unfunded     = classifications.filter(
    c => c.recommendation === Rec.DELEGATE && !allocatedIds.has(c.poolId) && !forcedIds.has(c.poolId)
  ).sort((a, b) => b.roaAtCurrent - a.roaAtCurrent);

  // AVOID pools (not currently delegated, not safe to start)
  const avoids = classifications.filter(
    c => c.recommendation === Rec.AVOID && !allocatedIds.has(c.poolId) && !forcedIds.has(c.poolId)
  );
  const avoidSafety = avoids.filter(c =>
    c.classType === ClassType.ALL_RED ||
    (c.classType === ClassType.HAS_RED_ZONE && !c.canClearTrough && !c.cursorPastTrough)
  );
  const perfFailed = avoids.filter(c => c.classType === ClassType.ALL_GREEN && !c.perfPasses);

  // Solicitation candidates sorted by lowest ROA (most harmed first)
  const solicit = classifications.filter(c => c.solicitCandidate)
    .sort((a, b) => a.roaAtCurrent - b.roaAtCurrent);

  // ── Header ────────────────────────────────────────────────────────────────
  push(`Pool Ranger Delegation Report — Epoch ${epochNo}`);
  push(line('='));
  push(`Generated: ${generatedAt}`);
  push(`r = ${r.toFixed(6)}  |  S_sat ≈ ${ada(sSat)}  |  Pool Ranger stake: ${ada(rangerTotalStakeAda)}`);
  push(`Global budget (total stake minus in-flight): ${ada(rangerAvailableAda)}`);
  blank();

  // ── Existing Delegations ──────────────────────────────────────────────────
  const existingTotal = existingEntries.length + forcedWithdrawals.length;
  if (existingTotal > 0) {
    push('EXISTING DELEGATIONS');
    push(line());
    for (const { c, entry } of existingEntries) {
      push(formatPool(c, entry));
      blank();
    }
    for (const c of forcedWithdrawals) {
      push(formatForcedWithdrawal(c));
      blank();
    }
  }

  // ── Rebalancing Moves ─────────────────────────────────────────────────────
  if (rebalanceMoves.length > 0) {
    push('REBALANCING MOVES  (epoch-agent recommends; administrator decides)');
    push(line('='));
    blank();

    let totalChurn = 0;
    let totalMoved = 0;
    let weightedBE = 0;

    for (const { c, entry } of rebalanceMoves) {
      const label    = c.ticker ? `[${c.ticker}]` : '';
      const movedAda = Math.abs(entry.netChangeAda);
      totalChurn    += entry.churnCostAda;
      totalMoved    += movedAda;
      if (entry.breakEvenEpochs !== null) weightedBE += movedAda * entry.breakEvenEpochs;

      push(`  ${label}`);
      push(`    Full ID:            ${c.poolId}`);
      push(`    Current delegation : ${ada(entry.currentAda)}  @  ${pct(entry.roaAtCurrent)}`);
      if (entry.moveType === 'REDUCE') {
        push(`    Proposed           : ${ada(entry.proposedAda)}  @  ${pct(entry.roaAtProposed)}  (REDUCE)`);
      } else {
        push(`    Proposed           : 0 ADA  (WITHDRAW — optimizer found higher-ROA opportunities)`);
      }
      push(`    Freed stake        : ${ada(movedAda)}  → redeployed to higher-ROA pools`);
      push(`    Churn cost         : ${entry.churnCostAda.toFixed(0)} ADA  (2 missed epochs on moved amount)`);
      push(`    Break-even         : ${beLabel(entry.breakEvenEpochs)}`);
      blank();
    }

    const avgBE = totalMoved > 0 && weightedBE > 0
      ? Math.round(weightedBE / totalMoved)
      : null;
    push(`  Totals — Churn cost: ${totalChurn.toFixed(0)} ADA` +
         (avgBE !== null ? `  |  Avg break-even: ${avgBE} epochs (~${Math.round(avgBE * 5)} days)` : ''));
    blank();
    push('  ⚠ WARNING: If any member joined within the last 2 epochs, their churn cost is');
    push('    doubled (4 missed epochs instead of 2). Per-member tracking not yet implemented.');
    blank();
  }

  // ── New Candidates ────────────────────────────────────────────────────────
  if (newEntries.length > 0 || unfunded.length > 0) {
    push('NEW CANDIDATES');
    push(line());
    for (const { c, entry } of newEntries) {
      push(formatPool(c, entry));
      blank();
    }
    for (const c of unfunded) {
      const label     = c.ticker ? `[${c.ticker}]` : '';
      const saturated = c.activeStakeAda >= sSat;
      push(`${label}  P=${ada(c.pledgeAda)}, F=${c.fixedCostAda} ADA, m=${(c.margin*100).toFixed(1)}%`);
      push(`  Full ID:           ${c.poolId}`);
      push(`  Classification:    ${describeClass(c)}`);
      push(`  Performance:       ${(c.perf * 100).toFixed(1)}%  (${c.perfValidEpochs} valid epochs)`);
      push(`  Active stake:      ${ada(c.activeStakeAda)}`);
      roaLines('  ', c).forEach(l => push(l));
      push(`  Recommendation:    QUALIFIES — ${saturated ? 'at or above saturation — no stake can be added' : 'budget exhausted this epoch'}`);
      blank();
    }
  }

  // ── Pools Avoided (safety reasons) ───────────────────────────────────────
  if (avoidSafety.length > 0) {
    push('POOLS AVOIDED (delegation would harm SPO or cannot clear trough)');
    push(line());
    for (const c of avoidSafety) {
      push(formatPool(c, undefined));
      blank();
    }
  }

  // ── Performance Failures ──────────────────────────────────────────────────
  if (perfFailed.length > 0) {
    push('POOLS DROPPED (failed 20-epoch performance filter)');
    push(line());
    for (const c of perfFailed) {
      const label = c.ticker ? `[${c.ticker}]` : '';
      push(`  ${label}  P=${ada(c.pledgeAda)}, F=${c.fixedCostAda}, m=${(c.margin*100).toFixed(1)}%`);
      push(`    Full ID:     ${c.poolId}`);
      push(`    Performance: ${(c.perf * 100).toFixed(1)}%  (${c.perfValidEpochs} valid epochs checked)`);
      push(`    Dropped: requires 100% performance over 20 epochs for DELEGATE eligibility`);
    }
    blank();
  }

  // ── Solicitation Candidates ───────────────────────────────────────────────
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
      push(`  ${label}`);
      push(`    Full ID:        ${c.poolId}`);
      push(`    Classification: ${c.classType}`);
      push(`    Projected ROA: ${pct(c.roaAtCurrent)}`);
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

  const forcedWdCount  = forcedWithdrawals.length;
  const forcedWdAda    = forcedWithdrawals.reduce((s, c) => s + c.rangerCurrentStake, 0);
  const rebalCount     = rebalanceMoves.length;
  const rebalMovedAda  = rebalanceMoves.reduce((s, { entry }) => s + Math.abs(entry.netChangeAda), 0);
  const totalChurnAda  = rebalanceMoves.reduce((s, { entry }) => s + entry.churnCostAda, 0);
  const addMoreEntries = existingEntries.filter(({ entry }) => entry.moveType === 'ADD_MORE');
  const addMoreAda     = addMoreEntries.reduce((s, { entry }) => s + entry.netChangeAda, 0);
  const addNewCount    = newEntries.length;
  const addNewAda      = newEntries.reduce((s, { entry }) => s + entry.proposedAda, 0);
  const qualifyNoRoom  = unfunded.length;

  if (forcedWdCount > 0) {
    push(`Forced withdrawals:  ${forcedWdCount} pool(s) — ${ada(forcedWdAda)} freed  (unsafe pools)`);
  }
  if (rebalCount > 0) {
    push(`Rebalancing moves:   ${rebalCount} pool(s) — ${ada(rebalMovedAda)} redistributed`);
    push(`Churn cost:          ${totalChurnAda.toFixed(0)} ADA  (2 missed epochs on moved stake)`);
  }
  if (addMoreEntries.length > 0) {
    push(`Increases:           ${addMoreEntries.length} existing pool(s) — ${ada(addMoreAda)} added`);
  }
  push(`New delegations:     ${addNewCount} pool(s) — ${ada(addNewAda)} to new pools`);
  if (qualifyNoRoom > 0) {
    push(`Qualifies/unfunded:  ${qualifyNoRoom} pool(s) qualify but received no stake this epoch`);
  }
  push(`Undeployed:          ${ada(undeployedAda)} (remaining after all allocations)`);
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

  // ── Luck Z-Score Trend ───────────────────────────────────────────────────
  // WINDOWS: z-score for non-overlapping 20-epoch slices of each pool's full history.
  //   Trend is visible on the very first run — no need to wait for multiple reports.
  // CROSS-RUN: z-score accumulated from previous epoch reports.
  //
  // Shown: pools with 2+ cross-run observations, OR pools whose within-run windows
  // are ALL consistently above +1.5σ or ALL below −1.5σ (systematic signal on run 1).
  const trendPools = Object.entries(poolLuckHistory)
    .filter(([, h]) => {
      if (!h.observations || h.observations.length === 0) return false;
      if (h.observations.length >= 2) return true;
      const wins = (h.observations[h.observations.length - 1]?.luckZ_windows ?? [])
        .map(w => w.luckZ).filter(z => z !== null);
      if (wins.length < 2) return false;
      return wins.every(z => z > 1.5) || wins.every(z => z < -1.5);
    })
    .sort(([, a], [, b]) => {
      const latestA = a.observations[a.observations.length - 1]?.luckZ ?? 0;
      const latestB = b.observations[b.observations.length - 1]?.luckZ ?? 0;
      return latestB - latestA;
    });

  push('LUCK Z-SCORE TREND  (systematic advantage tracker)');
  push(line());
  push('  Windows: z-score per 20-epoch slice of full history — trend visible on first run.');
  push('  Cross-run: z-score from each past report (builds up over multiple epochs).');
  push('  z > +1.5 consistently → likely real advantage; z < -1.5 → possible disadvantage.');
  blank();
  if (trendPools.length === 0) {
    push('  No pools with 2+ cross-run reports or consistently extreme windows yet.');
  } else {
    for (const [poolId, hist] of trendPools) {
      const label  = hist.ticker ? `[${hist.ticker}]` : `[${poolId.slice(0, 12)}…]`;
      const obs    = hist.observations;
      const latest = obs[obs.length - 1];
      push(`  ${label}`);

      // Within-run windows from most recent observation
      const wins = latest?.luckZ_windows ?? [];
      if (wins.length > 0) {
        const wStr = wins.map(w =>
          `${w.epochsAgo}: ${w.luckZ !== null ? (w.luckZ >= 0 ? '+' : '') + w.luckZ.toFixed(2) : 'n/a'}`
        ).join(',  ');
        push(`    Windows (epochs ago → z): ${wStr}`);
      }

      // Cross-run trend (only shown once 2+ reports exist)
      if (obs.length >= 2) {
        const zVals  = obs.map(o => o.luckZ != null
          ? (o.luckZ >= 0 ? '+' : '') + o.luckZ.toFixed(2) : ' n/a');
        const epochs = obs.map(o => o.epoch);
        push(`    Cross-run — Epochs: ${epochs.join(', ')}  z: ${zVals.join(', ')}`);
      }

      // Flag if windows are consistently directional, or cross-run readings are consistent
      const allWinZ  = wins.map(w => w.luckZ).filter(z => z !== null);
      const crossZ   = obs.filter(o => o.luckZ != null).map(o => o.luckZ);
      const winPos   = allWinZ.length  >= 2 && allWinZ.every(z => z >  1.5);
      const winNeg   = allWinZ.length  >= 2 && allWinZ.every(z => z < -1.5);
      const crossPos = crossZ.length   >= 2 && crossZ.every(z =>  z >  1.5);
      const crossNeg = crossZ.length   >= 2 && crossZ.every(z =>  z < -1.5);
      if (winPos || crossPos) push('    *** Consistently above +1.5σ — investigate for real advantage ***');
      if (winNeg || crossNeg) push('    *** Consistently below −1.5σ — investigate for real disadvantage ***');
    }
  }
  blank();

  // ── Next Steps ────────────────────────────────────────────────────────────
  push('NEXT STEPS (for administrator)');
  push(line());
  push('1. Review the recommendations above.');

  let step = 2;

  if (forcedWdCount > 0) {
    push(`${step}. Execute WITHDRAW transactions (unsafe pools) via _delegate.mjs for:`);
    for (const c of forcedWithdrawals) {
      const label = c.ticker ? `[${c.ticker}]` : '';
      push(`     ${label} — withdraw ${ada(c.rangerCurrentStake)}`);
    }
    step++;
  }

  if (rebalCount > 0) {
    push(`${step}. Review REBALANCING MOVES above. For each approved move, execute via _delegate.mjs:`);
    for (const { c, entry } of rebalanceMoves) {
      const label = c.ticker ? `[${c.ticker}]` : '';
      if (entry.moveType === 'WITHDRAW') {
        push(`     ${label} — withdraw ${ada(entry.currentAda)}  (break-even: ${beLabel(entry.breakEvenEpochs)})`);
      } else {
        push(`     ${label} — reduce to ${ada(entry.proposedAda)}  (break-even: ${beLabel(entry.breakEvenEpochs)})`);
      }
    }
    step++;
  }

  const hasAdds = addMoreEntries.length > 0 || newEntries.length > 0;
  if (hasAdds) {
    push(`${step}. Execute ADD/INCREASE transactions via _delegate.mjs for:`);
    for (const { c, entry } of addMoreEntries) {
      const label = c.ticker ? `[${c.ticker}]` : '';
      push(`     ${label} — increase by ${ada(entry.netChangeAda)} to ${ada(entry.proposedAda)}`);
    }
    for (const { c, entry } of newEntries) {
      const label = c.ticker ? `[${c.ticker}]` : '';
      push(`     ${label} — add ${ada(entry.proposedAda)}`);
    }
    step++;
  }

  push(`${step}. After submitting, record each change in ranger_state.json → inFlightChanges.`);
  push(`${step + 1}. Delegation changes take effect at epoch ${epochNo + 2} (rewards from epoch ${epochNo + 3}).`);
  push(`${step + 2}. Run this agent next epoch to track progress.`);
  blank();

  push('NOTE: Solicitation (Phase 2) not yet implemented.');
  blank();

  return lines.join('\n');
}

// ── Pool formatters ────────────────────────────────────────────────────────

// formatPool — formats a single pool section.
// entry: GlobalAllocationEntry from globalAllocateWithR, or undefined for AVOID pools.
function formatPool(c, entry) {
  const label = c.ticker ? `[${c.ticker}]` : '';
  const parts = [];

  parts.push(`${label}  P=${ada(c.pledgeAda)}, F=${c.fixedCostAda} ADA, m=${(c.margin*100).toFixed(1)}%`);
  parts.push(`  Full ID:           ${c.poolId}`);
  parts.push(`  Classification:    ${describeClass(c)}`);
  parts.push(`  Performance:       ${(c.perf * 100).toFixed(1)}%  (${c.perfValidEpochs} valid epochs)`);
  parts.push(`  Active stake:      ${ada(c.activeStakeAda)}  (Pool Ranger: ${ada(c.rangerCurrentStake)})`);
  roaLines('  ', c).forEach(l => parts.push(l));

  if (!entry) {
    // AVOID pool — show reason
    parts.push(`  Recommendation:    AVOID`);
    if (!c.perfPasses) {
      parts.push(`  Reason:            Performance ${(c.perf * 100).toFixed(1)}% < 100% (last 20 epochs)`);
    } else if (c.classType === ClassType.ALL_RED) {
      parts.push(`  Reason:            m=0% — delegation harms SPO income across full range`);
    } else if (c.classType === ClassType.HAS_RED_ZONE && !c.canClearTrough) {
      parts.push(`  Reason:            Before trough (${ada(c.troughExtAda)}) — insufficient stake to clear`);
    }
    return parts.join('\n');
  }

  switch (entry.moveType) {
    case 'HOLD':
      parts.push(`  Allocation:        ${ada(entry.currentAda)}  (no change)`);
      parts.push(`  Recommendation:    HOLD`);
      break;

    case 'ADD_NEW':
      parts.push(`  Current:           0 ADA  (new candidate)`);
      parts.push(`  Proposed:          ${ada(entry.proposedAda)}  @  ${pct(entry.roaAtProposed)}`);
      parts.push(`  Recommendation:    ADD  ${ada(entry.proposedAda)}`);
      break;

    case 'ADD_MORE':
      parts.push(`  Current:           ${ada(entry.currentAda)}  @  ${pct(entry.roaAtCurrent)}`);
      parts.push(`  Proposed:          ${ada(entry.proposedAda)}  @  ${pct(entry.roaAtProposed)}`);
      parts.push(`  Recommendation:    ADD MORE  (+${ada(entry.netChangeAda)})`);
      break;

    case 'REDUCE':
      parts.push(`  Current:           ${ada(entry.currentAda)}  @  ${pct(entry.roaAtCurrent)}`);
      parts.push(`  Proposed:          ${ada(entry.proposedAda)}  @  ${pct(entry.roaAtProposed)}`);
      parts.push(`  Recommendation:    REDUCE  (−${ada(Math.abs(entry.netChangeAda))})`);
      parts.push(`  Churn cost:        ${entry.churnCostAda.toFixed(0)} ADA  |  Break-even: ${beLabel(entry.breakEvenEpochs)}`);
      break;

    case 'WITHDRAW':
      parts.push(`  Current:           ${ada(entry.currentAda)}  @  ${pct(entry.roaAtCurrent)}`);
      parts.push(`  Proposed:          0 ADA  (optimizer found higher-ROA opportunities elsewhere)`);
      parts.push(`  Recommendation:    WITHDRAW  (−${ada(entry.currentAda)})`);
      parts.push(`  Churn cost:        ${entry.churnCostAda.toFixed(0)} ADA  |  Break-even: ${beLabel(entry.breakEvenEpochs)}`);
      break;
  }

  return parts.join('\n');
}

// formatForcedWithdrawal — formats an unsafe pool being exited (ALL_RED or unclearable).
function formatForcedWithdrawal(c) {
  const label = c.ticker ? `[${c.ticker}]` : '';
  const parts = [];

  parts.push(`${label}  P=${ada(c.pledgeAda)}, F=${c.fixedCostAda} ADA, m=${(c.margin*100).toFixed(1)}%`);
  parts.push(`  Full ID:           ${c.poolId}`);
  parts.push(`  Classification:    ${describeClass(c)}`);
  parts.push(`  Performance:       ${(c.perf * 100).toFixed(1)}%  (${c.perfValidEpochs} valid epochs)`);
  parts.push(`  Active stake:      ${ada(c.activeStakeAda)}  (Pool Ranger: ${ada(c.rangerCurrentStake)})`);
  roaLines('  ', c).forEach(l => parts.push(l));
  parts.push(`  Recommendation:    WITHDRAW ${ada(c.rangerCurrentStake)}  [UNSAFE POOL]`);
  if (c.classType === ClassType.ALL_RED) {
    parts.push(`  Note:              m=0% — SPO earns less with every delegator. Withdrawing helps the SPO.`);
  } else {
    parts.push(`  Note:              Cursor before trough — cannot clear with available stake. Withdrawing reduces harm.`);
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
