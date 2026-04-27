// Pool Ranger — Stake pool auto-discovery.
//
// Queries Koios for all registered mainnet pools, applies pre-filters, and writes
// (or merges) the results into candidate_pools.json so the epoch agent can evaluate them.
//
// Usage (from ranger/ directory):
//   node epoch_agent/discover_pools.mjs           -- replace candidate_pools.json
//   node epoch_agent/discover_pools.mjs --merge   -- add new pools, keep existing ones
//   node epoch_agent/discover_pools.mjs --dry-run -- print results, write nothing
//
// Filter thresholds can be overridden in ranger_state.json under "discoveryConfig":
//   {
//     "minActiveStakeAda":     1000000,  -- skip pools with < 1 M ADA active stake
//     "maxMarginFraction":     0.05,     -- skip pools with margin > 5%
//     "minEpochsOld":          30,       -- skip pools active for fewer than 30 epochs
//     "maxSaturationFraction": 1.0       -- skip pools at or above this fraction of S_sat
//   }

import 'dotenv/config';
import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { fetchCurrentEpoch,
         fetchAllPoolIds,
         fetchPoolsInfoForDiscovery } from './koios.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));

const CANDIDATE_POOLS_PATH = path.join(__dir, 'candidate_pools.json');
const RANGER_STATE_PATH    = path.join(__dir, 'ranger_state.json');

const MERGE   = process.argv.includes('--merge');
const DRY_RUN = process.argv.includes('--dry-run');
const BATCH   = 50;   // Koios /pool_info body limit is 5120 bytes; 50 IDs ≈ 3100 bytes

const DEFAULT_CONFIG = {
  minActiveStakeAda:     1_000_000,
  maxMarginFraction:     0.05,
  minEpochsOld:          30,
  maxSaturationFraction: 1.0,
};

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

async function main() {
  const unknownArgs = process.argv.slice(2).filter(a => a !== '--merge' && a !== '--dry-run');
  if (unknownArgs.length) {
    console.error(`Unknown argument(s): ${unknownArgs.join(' ')}`);
    console.error('Usage: node epoch_agent/discover_pools.mjs [--merge] [--dry-run]');
    process.exit(1);
  }

  console.log('[discover] Pool Ranger — stake pool discovery starting...');
  if (MERGE)   console.log('[discover] Mode: --merge (existing hand-picked pools will be preserved)');
  if (DRY_RUN) console.log('[discover] Mode: --dry-run (nothing will be written)');

  // Load discoveryConfig from ranger_state.json, falling back to defaults
  const state = readJson(RANGER_STATE_PATH) ?? {};
  const cfg = { ...DEFAULT_CONFIG, ...(state.discoveryConfig ?? {}) };
  console.log('[discover] Filter thresholds:');
  console.log(`  Min active stake:      ${cfg.minActiveStakeAda.toLocaleString()} ADA`);
  console.log(`  Max margin:            ${(cfg.maxMarginFraction * 100).toFixed(1)}%`);
  console.log(`  Min age:               ${cfg.minEpochsOld} epochs`);
  console.log(`  Max saturation:        ${(cfg.maxSaturationFraction * 100).toFixed(0)}% of S_sat`);

  // Fetch current epoch and compute S_sat
  console.log('[discover] Fetching current epoch from Koios...');
  const epochInfo = await fetchCurrentEpoch();
  const { epochNo, activeStakeAda } = epochInfo;
  const sSat = activeStakeAda / 500;
  console.log(`[discover] Current epoch: ${epochNo}`);
  console.log(`[discover] S_sat ≈ ${(sSat / 1e6).toFixed(1)} M ADA`);

  const maxStakeAda = cfg.maxSaturationFraction * sSat;

  // Fetch all pool IDs (all statuses — retirement filtering happens after pool_info batch fetch,
  // because /pool_list does not expose pool_status as a filterable column)
  console.log('[discover] Fetching all pool IDs from Koios...');
  const allIds = await fetchAllPoolIds();
  console.log(`[discover] Found ${allIds.length} total pools on mainnet.`);

  // Batch-fetch detailed pool info
  console.log(`[discover] Fetching pool details in batches of ${BATCH}...`);
  const allInfo = [];
  for (let i = 0; i < allIds.length; i += BATCH) {
    const chunk = allIds.slice(i, i + BATCH);
    process.stdout.write(`\r[discover]   ${Math.min(i + BATCH, allIds.length)} / ${allIds.length}   `);
    const info = await fetchPoolsInfoForDiscovery(chunk);
    allInfo.push(...info);
  }
  process.stdout.write('\n');
  console.log(`[discover] Received details for ${allInfo.length} pools.`);

  // Apply pre-filters — first failing check wins
  let countRetired  = 0;
  let countTooNew   = 0;
  let countTooSmall = 0;
  let countTooBig   = 0;
  let countHighFee  = 0;
  const passed = [];

  for (const p of allInfo) {
    if (p.poolStatus !== 'registered')             { countRetired++;  continue; }
    const age = p.activeEpochNo != null ? epochNo - p.activeEpochNo : null;
    if (age === null || age < cfg.minEpochsOld)    { countTooNew++;   continue; }
    if (p.activeStakeAda < cfg.minActiveStakeAda)  { countTooSmall++; continue; }
    if (p.activeStakeAda >= maxStakeAda)           { countTooBig++;   continue; }
    if (p.margin > cfg.maxMarginFraction)          { countHighFee++;  continue; }
    passed.push(p);
  }

  console.log('[discover] Filter results:');
  console.log(`  Passed all filters:         ${passed.length}`);
  console.log(`  Retired / retiring:         ${countRetired}`);
  console.log(`  Too new (< ${cfg.minEpochsOld} epochs):    ${countTooNew}`);
  console.log(`  Too small (< ${(cfg.minActiveStakeAda / 1e6).toFixed(0)} M ADA):   ${countTooSmall}`);
  console.log(`  Oversaturated (>= S_sat):   ${countTooBig}`);
  console.log(`  High fee (> ${(cfg.maxMarginFraction * 100).toFixed(0)}% margin):   ${countHighFee}`);

  if (passed.length === 0) {
    console.error('[discover] ERROR: No pools passed all filters — candidate_pools.json not modified.');
    process.exit(1);
  }

  // Build discovered pool entries (sorted by ticker for readability)
  const discovered = passed
    .map(p => ({ id: p.poolId, ticker: p.ticker ?? '' }))
    .sort((a, b) => (a.ticker || '￿').localeCompare(b.ticker || '￿'));

  // Merge with existing hand-picked pools if --merge
  let finalPools;
  let addedCount = 0;
  if (MERGE) {
    const existing = readJson(CANDIDATE_POOLS_PATH);
    const existingPools = [...(existing?.pools ?? [])];
    const existingIds = new Set(existingPools.map(p => p.id));
    for (const pool of discovered) {
      if (!existingIds.has(pool.id)) {
        existingPools.push(pool);
        addedCount++;
      }
    }
    finalPools = existingPools;
    console.log(`[discover] Merge: ${addedCount} new pools added, ${existingPools.length - addedCount} existing pools kept.`);
  } else {
    finalPools = discovered;
    console.log(`[discover] Replace: ${finalPools.length} pools from discovery.`);
  }

  // Deduplicate by id (keep first occurrence — fixes any pre-existing duplicates)
  const seen = new Set();
  const beforeDedup = finalPools.length;
  finalPools = finalPools.filter(p => {
    if (seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
  if (finalPools.length < beforeDedup) {
    console.log(`[discover] Removed ${beforeDedup - finalPools.length} duplicate(s).`);
  }

  // Build the output object
  const today  = new Date().toISOString().slice(0, 10);
  const modeNote = MERGE
    ? 'merged — hand-picked pools preserved'
    : 'replaced by auto-discovery';
  const output = {
    _comment:     `Auto-generated by discover_pools.mjs on ${today} (${modeNote}). ` +
                  `To use a hand-picked list instead, edit pools[] directly and skip this script. ` +
                  `Re-run without --merge to replace with fresh discovery; use --merge to add new pools without removing existing ones.`,
    _lastUpdated: today,
    _howToFind:   'Run: node epoch_agent/discover_pools.mjs [--merge] [--dry-run]',
    pools: finalPools,
  };

  if (DRY_RUN) {
    console.log(`\n[discover] --dry-run: would write ${finalPools.length} pools to candidate_pools.json`);
    const preview = finalPools.slice(0, 15);
    console.log(`[discover] First ${preview.length} pools:`);
    for (const p of preview) {
      console.log(`  ${(p.ticker || '(no ticker)').padEnd(10)} ${p.id}`);
    }
    if (finalPools.length > preview.length) {
      console.log(`  ... and ${finalPools.length - preview.length} more`);
    }
    return;
  }

  writeJson(CANDIDATE_POOLS_PATH, output);
  console.log(`[discover] Wrote ${finalPools.length} pools to candidate_pools.json`);
  console.log('[discover] Done. Run node epoch_agent/run.mjs to evaluate them.');
}

main().catch(err => {
  console.error('[discover] FATAL:', err.message);
  process.exit(1);
});
