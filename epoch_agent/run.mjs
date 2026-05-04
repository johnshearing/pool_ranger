// Pool Ranger Epoch Agent — main entry point.
//
// Usage (from ranger/ directory):
//   node epoch_agent/run.mjs
//   node epoch_agent/run.mjs --dry-run    (skip writing/updating ranger_state.json)
//
// What it does:
//   1. Reads candidate_pools.json → list of mainnet pool entries ({ id, ticker }) to evaluate
//   2. Reads ranger_state.json → current delegations, in-flight changes, total stake
//   3. Fetches pool data and epoch info from Koios mainnet
//   4. Classifies each pool (ALL_GREEN / ALL_RED / HAS_RED_ZONE)
//   5. Allocates available stake to maximize delegator ROA
//   6. Prints a recommendation report — administrator reviews and executes manually
//   7. Writes epoch_agent/reports/epoch_NNNN.txt

import 'dotenv/config';
import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { fetchPoolsInfo, fetchPoolHistory, fetchEpochInfo,
         fetchCurrentEpoch, fetchRecentR, fetchSupply } from './koios.mjs';
import { classifyPool, Rec } from './classify.mjs';
import { globalAllocateWithR } from './allocate.mjs';
import { formatReport } from './report.mjs';
import { delegROA, computeSsat } from './math.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));

const CANDIDATE_POOLS_PATH = path.join(__dir, 'candidate_pools.json');
const RANGER_STATE_PATH    = path.join(__dir, 'ranger_state.json');
const REPORTS_DIR          = path.join(__dir, 'reports');

const DRY_RUN = process.argv.includes('--dry-run');

// ── Helpers ────────────────────────────────────────────────────────────────

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw new Error(`Cannot parse ${filePath}: ${err.message}`);
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

// computeWeightedRoa — weighted-average ROA across a set of pools.
// poolRoaMap: Map<poolId, { stakeAda, roaPct }>
function computeWeightedRoa(poolRoaMap) {
  let totalStake = 0;
  let totalWeight = 0;
  for (const { stakeAda, roaPct } of poolRoaMap.values()) {
    totalStake  += stakeAda;
    totalWeight += stakeAda * roaPct;
  }
  return totalStake > 0 ? totalWeight / totalStake : 0;
}

// settleInFlight — move any in-flight changes whose activeFromEpoch <= currentEpoch
// into currentDelegations and return the updated state object.
function settleInFlight(state, currentEpoch) {
  const stillInFlight = [];
  for (const change of state.inFlightChanges) {
    if (change.activeFromEpoch <= currentEpoch) {
      // Settled — update currentDelegations
      if (change.changeType === 'ADD') {
        const existing = state.currentDelegations[change.poolId];
        state.currentDelegations[change.poolId] = {
          ticker:            change.ticker ?? existing?.ticker,
          stakeAda:          (existing?.stakeAda ?? 0) + change.stakeAda,
          delegatedAtEpoch:  existing?.delegatedAtEpoch ?? change.submittedAtEpoch,
          activeFromEpoch:   change.activeFromEpoch,
        };
      } else if (change.changeType === 'WITHDRAW') {
        const existing = state.currentDelegations[change.poolId];
        if (existing) {
          existing.stakeAda -= change.stakeAda;
          if (existing.stakeAda <= 0) delete state.currentDelegations[change.poolId];
        }
      }
      state.completedChanges.push({ ...change, settledAtEpoch: currentEpoch });
    } else {
      stillInFlight.push(change);
    }
  }
  state.inFlightChanges = stillInFlight;
  return state;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('[run] Pool Ranger Epoch Agent starting...');

  // 1. Read candidate pools
  const candidateConfig = readJson(CANDIDATE_POOLS_PATH);
  if (!candidateConfig) {
    console.error(`ERROR: ${CANDIDATE_POOLS_PATH} not found.`);
    console.error('Create it with a list of mainnet pool IDs. See candidate_pools.json.example.');
    process.exit(1);
  }
  const poolIds = (candidateConfig.pools ?? []).map(p => p.id);
  if (poolIds.length === 0) {
    console.error('ERROR: candidate_pools.json has no pools. Add entries with { id, ticker } for each pool.');
    process.exit(1);
  }
  console.log(`[run] Evaluating ${poolIds.length} candidate pool(s).`);

  // 2. Read ranger state
  let state = readJson(RANGER_STATE_PATH) ?? {
    _schemaVersion:     1,
    lastUpdatedEpoch:   0,
    totalMemberStakeAda: 0,
    currentDelegations: {},
    inFlightChanges:    [],
    completedChanges:   [],
  };
  if (state.totalMemberStakeAda === 0) {
    console.warn('[run] WARNING: totalMemberStakeAda is 0 in ranger_state.json.');
    console.warn('  Update it with the combined stake of all Pool Ranger members.');
    console.warn('  The report will still run but allocation will show 0 available ADA.');
  }

  // 3. Fetch current epoch from Koios
  console.log('[run] Fetching epoch data from Koios...');
  const epochInfo = await fetchCurrentEpoch();
  const { epochNo } = epochInfo;
  console.log(`[run] Current epoch: ${epochNo}`);

  // Settle any in-flight changes that are now active
  state = settleInFlight(state, epochNo);

  // 4. Fetch epoch rate r
  const r = await fetchRecentR(5);
  console.log(`[run] Epoch rate r = ${r.toFixed(6)}`);

  // Saturation point — use total ADA supply, not active stake.
  // S_sat = supply / k because the protocol defines saturation as a fraction of total supply.
  // active_stake is only ~57% of supply; using it understates S_sat by ~40%.
  const supplyAda = await fetchSupply();
  const sSat = computeSsat(supplyAda);
  console.log(`[run] S_sat ≈ ${(sSat / 1e6).toFixed(1)} M ADA  (supply ${(supplyAda / 1e9).toFixed(2)} B ADA / k=500)`);

  // 5. Fetch pool info for all candidates
  console.log('[run] Fetching pool parameters...');
  const poolInfos = await fetchPoolsInfo(poolIds);
  if (poolInfos.length === 0) {
    console.error('ERROR: Koios returned no pool data. Check pool IDs in candidate_pools.json.');
    process.exit(1);
  }
  const poolInfoMap = new Map(poolInfos.map(p => [p.poolId, p]));

  // 6. Fetch pool history for all candidates, throttled to avoid overwhelming Koios.
  console.log('[run] Fetching pool history (up to 73 epochs each)...');
  const HISTORY_CONCURRENCY = 5;
  const historyEntries = [];
  for (let i = 0; i < poolIds.length; i += HISTORY_CONCURRENCY) {
    const chunk = poolIds.slice(i, i + HISTORY_CONCURRENCY);
    process.stdout.write(`\r[run]   ${Math.min(i + HISTORY_CONCURRENCY, poolIds.length)} / ${poolIds.length}   `);
    const batch = await Promise.all(chunk.map(id => fetchPoolHistory(id, 73).then(h => [id, h])));
    historyEntries.push(...batch);
    if (i + HISTORY_CONCURRENCY < poolIds.length) await new Promise(r => setTimeout(r, 200));
  }
  process.stdout.write('\n');
  const poolHistoryMap = new Map(historyEntries);

  // 7. Collect all epoch numbers and fetch network epoch info
  const allEpochNos = new Set();
  for (const [, hist] of poolHistoryMap) {
    for (const entry of hist) allEpochNos.add(entry.epochNo);
  }
  console.log(`[run] Fetching epoch info for ${allEpochNos.size} epochs...`);
  const epochInfoMap = await fetchEpochInfo([...allEpochNos]);

  // 8. Compute available stake
  const deployedStake = Object.values(state.currentDelegations)
    .reduce((s, d) => s + (d.stakeAda ?? 0), 0);
  const pendingStake = state.inFlightChanges
    .filter(c => c.changeType === 'ADD')
    .reduce((s, c) => s + c.stakeAda, 0);
  const rangerAvailableAda = Math.max(0, state.totalMemberStakeAda - deployedStake - pendingStake);
  console.log(`[run] Pool Ranger stake: ${(state.totalMemberStakeAda / 1e6).toFixed(2)} M ADA`);
  console.log(`[run] Deployed: ${(deployedStake / 1e6).toFixed(2)} M ADA  |  Available: ${(rangerAvailableAda / 1e6).toFixed(2)} M ADA`);

  // 9. Classify each pool
  console.log('[run] Classifying pools...');
  const classifications = [];
  for (const poolId of poolIds) {
    const poolInfo = poolInfoMap.get(poolId);
    if (!poolInfo) {
      console.warn(`[run] Pool ${poolId} not found in Koios response — skipping.`);
      continue;
    }
    const poolHistory      = poolHistoryMap.get(poolId) ?? [];
    const rangerCurrentStake = state.currentDelegations[poolId]?.stakeAda ?? 0;

    const result = classifyPool(
      poolInfo, poolHistory, epochInfoMap,
      rangerCurrentStake, rangerAvailableAda, r, sSat,
    );
    classifications.push(result);
  }

  // 10. Forced withdrawals — unsafe pools (ALL_RED or unclearable HAS_RED_ZONE)
  const forcedWithdrawals = classifications.filter(c => c.recommendation === Rec.WITHDRAW);

  // 11. Global allocation — all safe pools compete for Pool Ranger's full stake.
  // HOLD and DELEGATE pools are treated identically: every safe pool is re-evaluated
  // each epoch so stake naturally flows toward better opportunities.
  const safePools    = classifications.filter(
    c => c.recommendation === Rec.DELEGATE || c.recommendation === Rec.HOLD
  );
  // Budget = total member stake minus in-flight ADDs (those are already committed to
  // specific pools and must not be double-counted).
  const globalBudget = Math.max(0, state.totalMemberStakeAda - pendingStake);
  const allocation   = globalAllocateWithR(safePools, globalBudget, sSat, r);

  // 12. Compute weighted ROA before and after changes
  const roaBefore = new Map();
  const roaAfter  = new Map();

  for (const c of classifications) {
    if (c.rangerCurrentStake > 0) {
      roaBefore.set(c.poolId, { stakeAda: c.rangerCurrentStake, roaPct: c.roaAtCurrent });
    }
  }
  for (const [poolId, entry] of allocation) {
    if (entry.proposedAda > 0) {
      roaAfter.set(poolId, { stakeAda: entry.proposedAda, roaPct: entry.roaAtProposed });
    }
  }
  const weightedRoaBefore = computeWeightedRoa(roaBefore);
  const weightedRoaAfter  = computeWeightedRoa(roaAfter);

  // 13. Compute undeployed ADA
  const totalAllocated = [...allocation.values()].reduce((s, e) => s + e.proposedAda, 0);
  const undeployedAda  = Math.max(0, globalBudget - totalAllocated);

  // 14. Update poolLuckHistory — append one observation per pool per epoch
  if (!state.poolLuckHistory) state.poolLuckHistory = {};
  for (const c of classifications) {
    if (c.luckZ === null && c.luckPremium === null) continue;
    if (!state.poolLuckHistory[c.poolId]) {
      state.poolLuckHistory[c.poolId] = { ticker: c.ticker, observations: [] };
    }
    const hist = state.poolLuckHistory[c.poolId];
    hist.ticker = c.ticker;
    if (!hist.observations.some(o => o.epoch === epochNo)) {
      hist.observations.push({
        epoch:         epochNo,
        luckZ:         c.luckZ       !== null ? parseFloat(c.luckZ.toFixed(2))       : null,
        luckPremium:   c.luckPremium !== null ? parseFloat(c.luckPremium.toFixed(4)) : null,
        nEpochs:       c.luckZValidEpochs ?? 0,
        luckZ_windows: c.luckZWindows ?? [],
      });
      // Keep only the most recent 20 observations to bound file growth
      if (hist.observations.length > 20) hist.observations.shift();
    }
  }

  // Detect parameter changes since last run
  if (!state.poolParamHistory) state.poolParamHistory = {};
  const paramChanges = [];
  const prevEpochNo  = state.lastUpdatedEpoch > 0 ? state.lastUpdatedEpoch : null;

  for (const c of classifications) {
    if (!state.poolParamHistory[c.poolId]) {
      // First time seeing this pool — record baseline, no change to report
      state.poolParamHistory[c.poolId] = {
        ticker:   c.ticker,
        lastSeen: { fixedCostAda: c.fixedCostAda, margin: c.margin, pledgeAda: c.pledgeAda, epoch: epochNo },
        changes:  [],
      };
      continue;
    }

    const entry    = state.poolParamHistory[c.poolId];
    const prev     = entry.lastSeen;
    const detected = [];

    if (prev.fixedCostAda !== c.fixedCostAda) {
      detected.push({ field: 'Fixed fee', from: prev.fixedCostAda, to: c.fixedCostAda, unit: 'ada' });
      entry.changes.push({ epoch: epochNo, field: 'fixedCostAda', from: prev.fixedCostAda, to: c.fixedCostAda });
    }
    // Compare margin to 0.01% precision to avoid floating-point noise
    if (Math.round(prev.margin * 10000) !== Math.round(c.margin * 10000)) {
      detected.push({ field: 'Margin', from: prev.margin, to: c.margin, unit: 'pct' });
      entry.changes.push({ epoch: epochNo, field: 'margin', from: prev.margin, to: c.margin });
    }
    // Compare pledge to nearest whole ADA
    if (Math.round(prev.pledgeAda) !== Math.round(c.pledgeAda)) {
      detected.push({ field: 'Pledge', from: prev.pledgeAda, to: c.pledgeAda, unit: 'ada' });
      entry.changes.push({ epoch: epochNo, field: 'pledgeAda', from: prev.pledgeAda, to: c.pledgeAda });
    }

    // Update lastSeen regardless of whether anything changed
    entry.ticker   = c.ticker;
    entry.lastSeen = { fixedCostAda: c.fixedCostAda, margin: c.margin, pledgeAda: c.pledgeAda, epoch: epochNo };

    if (detected.length > 0) {
      paramChanges.push({
        poolId:             c.poolId,
        ticker:             c.ticker,
        recommendation:     c.recommendation,
        rangerCurrentStake: c.rangerCurrentStake,
        totalChanges:       entry.changes.length,
        detected,
      });
    }
  }

  // Format and output report
  const generatedAt = new Date().toISOString();
  const reportText  = formatReport({
    epochNo,
    r,
    sSat,
    rangerTotalStakeAda: state.totalMemberStakeAda,
    rangerAvailableAda: globalBudget,
    classifications,
    allocation,
    forcedWithdrawals,
    weightedRoaBefore,
    weightedRoaAfter,
    generatedAt,
    undeployedAda,
    poolLuckHistory:  state.poolLuckHistory,
    minHighPledgeAda: state.discoveryConfig?.minHighPledgeAda ?? 2_500_000,
    paramChanges,
    prevEpochNo,
  });

  console.log('\n' + reportText);

  // Write to reports/epoch_NNNN.txt
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const reportPath = path.join(REPORTS_DIR, `epoch_${epochNo}.txt`);
  fs.writeFileSync(reportPath, reportText, 'utf8');
  console.log(`[run] Report saved to: ${reportPath}`);

  // 15. Update state (unless --dry-run)
  if (!DRY_RUN) {
    state.lastUpdatedEpoch = epochNo;
    state.lastRunAt        = generatedAt;
    writeJson(RANGER_STATE_PATH, state);
    console.log('[run] ranger_state.json updated (in-flight changes settled).');
  } else {
    console.log('[run] --dry-run: ranger_state.json NOT updated.');
  }

  console.log('[run] Done.');
}

main().catch(err => {
  console.error('[run] FATAL:', err.message);
  process.exit(1);
});
