// Pool Ranger — Multi-CIP Combined Simulator data exporter.
//
// Read-only. Produces reports/multi_cip_sim_data.txt: the full registered
// active-pool population in the SAME prose format as epoch_<N>.txt, so the
// simulator's parser (lifted from epoch_report_viewer.html) reads it with no
// changes.
//
// Unlike run.mjs, this does NOT fetch per-pool history, classify, allocate, run
// the optimizer, compute luck z-scores, or touch ranger_state.json /
// candidate_pools.json. It sweeps /pool_info once — which is all the simulator
// needs: pledge, fixed fee, margin, active stake, and ticker per pool, plus the
// global r and S_sat in the header. The simulator derives delegation as
// (Active stake − Pledge) and computes all ROA / earnings itself.
//
// Filters applied: registered pools only, with active stake > 0. (A registered
// pool with zero active stake has no pledge and no delegation, so it would only
// pile up at the origin of the chart.)
//
// Usage (from the ranger/ directory):
//   node epoch_agent/export_multi_cip_sim_data.mjs
//   node epoch_agent/export_multi_cip_sim_data.mjs --dry-run   (print, write nothing)
//
// Requires ranger/.env with the same Koios setup the other scripts use
// (KOIOS_API_KEY is optional — it raises the rate limit but is not required).

import 'dotenv/config';
import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { fetchAllPoolIds, fetchPoolsInfo, fetchPoolsInfoForDiscovery,
         fetchSupply, fetchRecentR, fetchCurrentEpoch } from './koios.mjs';
import { computeSsat } from './math.mjs';

const __dir    = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(__dir, 'reports', 'multi_cip_sim_data.txt');
const BATCH    = 50;   // Koios /pool_info POST body limit ≈ 50 IDs (~3100 bytes)
const DRY_RUN  = process.argv.includes('--dry-run');

// Same "M ADA" formatter the epoch report uses, so the lifted parser matches.
function ada(n) {
  return (n / 1_000_000).toFixed(2) + ' M ADA';
}

async function main() {
  console.log('[export] Multi-CIP simulator data export starting...');
  if (DRY_RUN) console.log('[export] Mode: --dry-run (nothing will be written)');

  // Global header values: current epoch, reward rate r, saturation point S_sat.
  const { epochNo } = await fetchCurrentEpoch();
  console.log(`[export] Current epoch: ${epochNo}`);
  const supplyAda = await fetchSupply();
  const sSat = computeSsat(supplyAda);
  const r    = await fetchRecentR(5);
  console.log(`[export] r = ${r.toFixed(6)}  |  S_sat ≈ ${ada(sSat)}  ` +
              `(supply ${(supplyAda / 1e9).toFixed(2)} B ADA / k=500)`);

  // 1. Every pool ID on mainnet (all statuses — /pool_list has no status column).
  console.log('[export] Fetching all pool IDs from Koios...');
  const allIds = await fetchAllPoolIds();
  console.log(`[export] Found ${allIds.length} total pools on mainnet.`);

  // 2. Registered pools only. pool_status lives on /pool_info, so read it in
  //    batches via the lightweight discovery mapper.
  console.log('[export] Filtering to registered pools...');
  const registeredIds = [];
  let retiredCount = 0;
  for (let i = 0; i < allIds.length; i += BATCH) {
    const chunk = allIds.slice(i, i + BATCH);
    process.stdout.write(`\r[export]   status ${Math.min(i + BATCH, allIds.length)} / ${allIds.length}   `);
    const info = await fetchPoolsInfoForDiscovery(chunk);
    for (const p of info) {
      if (p.poolStatus === 'registered') registeredIds.push(p.poolId);
      else retiredCount++;
    }
  }
  process.stdout.write('\n');
  console.log(`[export] Registered: ${registeredIds.length}  |  retired/retiring: ${retiredCount}`);

  // 3. Full parameters (pledge, fixed fee, margin, active stake, ticker) for the
  //    registered pools.
  console.log('[export] Fetching pool parameters...');
  const infos = [];
  for (let i = 0; i < registeredIds.length; i += BATCH) {
    const chunk = registeredIds.slice(i, i + BATCH);
    process.stdout.write(`\r[export]   params ${Math.min(i + BATCH, registeredIds.length)} / ${registeredIds.length}   `);
    const batch = await fetchPoolsInfo(chunk);
    infos.push(...batch);
  }
  process.stdout.write('\n');

  // 4. Drop pools with no active stake — no (pledge, delegation) position to plot.
  const live = infos
    .filter(p => p.activeStakeAda > 0)
    .sort((a, b) => b.activeStakeAda - a.activeStakeAda);
  console.log(`[export] ${live.length} registered pools with active stake > 0.`);

  if (live.length === 0) {
    console.error('[export] ERROR: no pools to write — output not created.');
    process.exit(1);
  }

  // 5. Build the report in the epoch-report prose format.
  const lines = [];
  const push  = (...ss) => ss.forEach(s => lines.push(s));

  push(`Multi-CIP Simulator Data — Epoch ${epochNo}`);
  push('='.repeat(60));
  push(`Generated: ${new Date().toISOString()}`);
  push(`r = ${r.toFixed(6)}  |  S_sat ≈ ${ada(sSat)}`);
  push(`Registered active pools: ${live.length}  (of ${allIds.length} total on mainnet)`);
  push('');
  push('ALL ACTIVE POOLS');
  push('-'.repeat(60));
  push('  Full registered active-pool population for the Multi-CIP Combined Simulator.');
  push('  Delegation is derived by the simulator as (Active stake − Pledge).');
  push('  Sorted by active stake, descending.');
  push('');

  for (const p of live) {
    const label = p.ticker ? `[${p.ticker}]` : '';
    push(`${label}  P=${ada(p.pledgeAda)}, F=${Math.round(p.fixedCostAda)} ADA, m=${(p.margin * 100).toFixed(1)}%`);
    push(`  Full ID:           ${p.poolId}`);
    push(`  Active stake:      ${ada(p.activeStakeAda)}`);
    push('');
  }

  const text = lines.join('\n');

  if (DRY_RUN) {
    console.log(`[export] --dry-run: would write ${live.length} pools to ${OUT_PATH}`);
    console.log('[export] First 20 lines of output:\n');
    console.log(text.split('\n').slice(0, 20).join('\n'));
    return;
  }

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, text, 'utf8');
  console.log(`[export] Wrote ${live.length} pools to ${OUT_PATH}`);
  console.log('[export] Done. Use this file as the Population-mode data source for the simulator.');
}

main().catch(err => {
  console.error('[export] FATAL:', err.message);
  process.exit(1);
});
