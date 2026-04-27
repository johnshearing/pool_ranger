// Koios mainnet API wrapper for Pool Ranger epoch agent.
// Fetches pool parameters and epoch data needed for classification and ROA math.
//
// All monetary values returned in ADA (not lovelace).
// margin is returned as a fraction (0.05 = 5%), already that way from Koios.
//
// API key: optional. Set KOIOS_API_KEY in ranger/.env for higher rate limits.
// Without a key the public tier allows ~10 req/s which is sufficient.

import 'dotenv/config';

const KOIOS_BASE = 'https://api.koios.rest/api/v1';
const R_FALLBACK = 0.000548;   // per-epoch rate fallback if Koios data is unavailable
const R_MIN      = 0.00010;    // safety floor — r declines as reserve depletes
const R_MAX      = 0.00100;

function authHeaders() {
  const key = process.env.KOIOS_API_KEY;
  return key ? { Authorization: `Bearer ${key}` } : {};
}

// Internal fetch with retry on HTTP 429 (rate limit) and transient network errors.
async function koiosFetch(path, options = {}) {
  const url = `${KOIOS_BASE}${path}`;
  const headers = { 'Content-Type': 'application/json', ...authHeaders(), ...options.headers };
  let delay = 1500;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const res = await fetch(url, { ...options, headers });
      if (res.status === 429 || res.status === 503 || res.status === 504) {
        await new Promise(r => setTimeout(r, delay));
        delay = Math.min(delay * 2, 30000);
        continue;
      }
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Koios ${res.status} ${res.statusText} for ${path}: ${body.slice(0, 200)}`);
      }
      return res.json();
    } catch (err) {
      // Re-throw non-retryable errors (e.g. JSON parse errors, explicit throws above)
      if (err.message.startsWith('Koios ')) throw err;
      // Transient network error — wait and retry
      if (attempt === 5) throw new Error(`Koios network error for ${path} after retries: ${err.message}`);
      await new Promise(r => setTimeout(r, delay));
      delay = Math.min(delay * 2, 30000);
    }
  }
  throw new Error(`Koios request failed after retries for ${path}`);
}

const POOL_INFO_BATCH = 50;   // Koios /pool_info body limit is 5120 bytes; 50 IDs ≈ 3100 bytes

// fetchPoolsInfo — fetch parameters for a list of pools, batching to stay under Koios's
// 5120-byte POST body limit.
// poolIds: string[] of bech32 pool IDs (pool1...)
// Returns: PoolInfo[]
//   { poolId, ticker, name, pledgeAda, fixedCostAda, margin, activeStakeAda }
export async function fetchPoolsInfo(poolIds) {
  if (poolIds.length === 0) return [];
  const results = [];
  for (let i = 0; i < poolIds.length; i += POOL_INFO_BATCH) {
    const chunk = poolIds.slice(i, i + POOL_INFO_BATCH);
    const data = await koiosFetch('/pool_info', {
      method: 'POST',
      body: JSON.stringify({ _pool_bech32_ids: chunk }),
    });
    for (const p of data) {
      results.push({
        poolId:         p.pool_id_bech32,
        ticker:         p.meta_json?.ticker ?? null,
        name:           p.meta_json?.name   ?? null,
        pledgeAda:      Number(p.pledge)      / 1e6,
        fixedCostAda:   Number(p.fixed_cost)  / 1e6,
        margin:         Number(p.margin),
        activeStakeAda: Number(p.active_stake ?? p.live_stake ?? 0) / 1e6,
      });
    }
  }
  return results;
}

// fetchPoolHistory — block and stake history for a single pool.
// Returns entries sorted descending by epoch (most recent first).
// Returns: HistoryEntry[]
//   { epochNo, activeStakeAda, blockCnt }
export async function fetchPoolHistory(poolId, maxEpochs = 73) {
  const data = await koiosFetch(
    `/pool_history?_pool_bech32=${encodeURIComponent(poolId)}` +
    `&select=epoch_no,active_stake,block_cnt` +
    `&order=epoch_no.desc` +
    `&limit=${maxEpochs}`,
  );
  return data.map(e => ({
    epochNo:        Number(e.epoch_no),
    activeStakeAda: Number(e.active_stake ?? 0) / 1e6,
    blockCnt:       Number(e.block_cnt    ?? 0),
  }));
}

// fetchEpochInfo — network-wide stats for a list of epoch numbers.
// Returns: Map<epochNo, EpochInfoEntry>
//   { activeStakeAda, blkCount, totalRewardsAda }
// Note: total_rewards is null for the 2 most recent epochs (not yet distributed).
export async function fetchEpochInfo(epochNos) {
  if (epochNos.length === 0) return new Map();
  const unique = [...new Set(epochNos)].sort((a, b) => a - b);
  const list   = unique.join(',');
  const data   = await koiosFetch(
    `/epoch_info?epoch_no=in.(${list})&select=epoch_no,blk_count,active_stake,total_rewards`,
  );
  const map = new Map();
  for (const e of data) {
    map.set(Number(e.epoch_no), {
      activeStakeAda:   Number(e.active_stake    ?? 0) / 1e6,
      blkCount:         Number(e.blk_count       ?? 0),
      totalRewardsAda:  e.total_rewards != null ? Number(e.total_rewards) / 1e6 : null,
    });
  }
  return map;
}

// fetchCurrentEpoch — returns the latest epoch info.
// Note: the current in-progress epoch has partial blk_count; active_stake is the snapshot.
// Returns: { epochNo, activeStakeAda, blkCount }
export async function fetchCurrentEpoch() {
  const data = await koiosFetch(
    '/epoch_info?select=epoch_no,blk_count,active_stake&order=epoch_no.desc&limit=1',
  );
  if (!data.length) throw new Error('Koios epoch_info returned empty result');
  const e = data[0];
  return {
    epochNo:        Number(e.epoch_no),
    activeStakeAda: Number(e.active_stake ?? 0) / 1e6,
    blkCount:       Number(e.blk_count    ?? 0),
  };
}

// fetchAllPoolIds — pages through /pool_list to get every pool ID (all statuses).
// Status filtering (registered vs retired) happens downstream in fetchPoolsInfoForDiscovery,
// because /pool_list does not expose pool_status as a filterable column.
// Returns string[] of bech32 IDs.
export async function fetchAllPoolIds() {
  const PAGE_SIZE = 1000;
  const ids = [];
  let offset = 0;
  while (true) {
    const data = await koiosFetch(
      `/pool_list?select=pool_id_bech32&limit=${PAGE_SIZE}&offset=${offset}`,
    );
    for (const p of data) ids.push(p.pool_id_bech32);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return ids;
}

// fetchPoolsInfoForDiscovery — like fetchPoolsInfo but adds active_epoch_no and pool_status
// for age and retirement filtering. Intended for use by discover_pools.mjs.
// Returns: DiscoveryInfo[]
//   { poolId, ticker, poolStatus, activeEpochNo, activeStakeAda, margin }
export async function fetchPoolsInfoForDiscovery(poolIds) {
  if (poolIds.length === 0) return [];
  const data = await koiosFetch('/pool_info', {
    method: 'POST',
    body: JSON.stringify({ _pool_bech32_ids: poolIds }),
  });
  return data.map(p => ({
    poolId:         p.pool_id_bech32,
    ticker:         p.meta_json?.ticker ?? null,
    poolStatus:     p.pool_status ?? 'registered',
    activeEpochNo:  p.active_epoch_no != null ? Number(p.active_epoch_no) : null,
    activeStakeAda: Number(p.active_stake ?? p.live_stake ?? 0) / 1e6,
    margin:         Number(p.margin),
  }));
}

// fetchRecentR — compute the per-epoch reward rate r averaged over N settled epochs.
// r_epoch = totalRewardsAda / activeStakeAda  (both in ADA — ratio is unit-free)
// total_rewards is only populated ~2+ epochs in the past, so we look back enough epochs
// to collect numEpochs settled data points.
// Falls back to R_FALLBACK if data is insufficient.
export async function fetchRecentR(numEpochs = 5) {
  const current = await fetchCurrentEpoch();
  // Fetch extra epochs to account for the 2-epoch settlement lag on total_rewards
  const lookback = numEpochs + 4;
  const epochNos = [];
  for (let i = 2; i < 2 + lookback; i++) epochNos.push(current.epochNo - i);
  const map = await fetchEpochInfo(epochNos);

  const rates = [];
  for (const [, info] of map) {
    if (info.totalRewardsAda != null && info.activeStakeAda > 0 && info.totalRewardsAda > 0) {
      const r = info.totalRewardsAda / info.activeStakeAda;
      if (r >= R_MIN && r <= R_MAX) rates.push(r);
    }
    if (rates.length >= numEpochs) break;
  }

  if (rates.length === 0) {
    console.warn(`[koios] Could not compute r from recent epochs — using fallback ${R_FALLBACK}`);
    return R_FALLBACK;
  }
  return rates.reduce((a, b) => a + b, 0) / rates.length;
}
