// The radar's model: one frozen snapshot in, one reasoned board out.
//
// Nothing here predicts whether a token will launch. It answers a narrower question: if a protocol's
// present record stayed as it is, what would a hypothetical launch be worth, and what should a reader
// do to earn a place in that protocol before or after a launch? Every number is derived from the
// snapshot's own fields (TVL, seven-day TVL change, listing date, chains); no protocol name or slug is
// singled out, and the constants below are the same for every row.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface ModelConstants {
  base_multiple: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  tenure_floor: number;
  tenure_span: number;
  tenure_days: number;
  unknown_age_days: number;
  chain_step: number;
  chain_max: number;
}

export const MODEL: ModelConstants = {
  base_multiple: 0.35,
  growth_weight: 0.65,
  growth_floor: -50,
  growth_cap: 100,
  tenure_floor: 0.88,
  tenure_span: 0.24,
  tenure_days: 1460,
  unknown_age_days: 180,
  chain_step: 0.03,
  chain_max: 5,
};

export const MODEL_VERSION = 'launch-equity-2';
export const EARLY_ROWS = 180;
export const LIVE_ROWS = 24;

export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

export interface ScoreParts {
  base_usd: number;
  growth_pct: number;
  growth_multiplier: number;
  tenure_multiplier: number;
  chain_multiplier: number;
  age_days: number | null;
  age_used_days: number;
}

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'no-token-on-record';
  age_days: number | null;
  implied_value_usd: number;
  model: ScoreParts;
  farm_steps: string[];
}

export interface RadarRow extends Omit<BoardRow, 'gecko_id' | 'symbol' | 'token_status'> {}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const DERIVED = /\b(wrapped|staked|staking)\b/i;
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;
const EXCLUDED_CATEGORY = /^(Bridge|Canonical Bridge|Liquid Staking|Liquid Restaking|Restaked BTC|CEX)$/i;

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

function round(n: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

/** Whole days between the snapshot date and the day DefiLlama began tracking the protocol. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The launch-equity model, in four named factors that the dashboard also displays. */
export function scoreProtocol(p: SnapshotProtocol, asOf: string, model: ModelConstants): { implied: number; parts: ScoreParts } {
  const age = ageDays(asOf, p.listed_at);
  const ageUsed = age ?? model.unknown_age_days;
  const growthPct = clamp(finite(p.change_7d, 0), model.growth_floor, model.growth_cap);
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const tenureMult = model.tenure_floor + (clamp(ageUsed, 0, model.tenure_days) / model.tenure_days) * model.tenure_span;
  const chainCount = clamp(p.chains.length, 1, model.chain_max);
  const chainMult = 1 + (chainCount - 1) * model.chain_step;
  const base = p.tvl_usd * model.base_multiple;
  const implied = Math.max(1, Math.round(base * growthMult * tenureMult * chainMult));
  return {
    implied,
    parts: {
      base_usd: Math.round(base),
      growth_pct: round(growthPct, 2),
      growth_multiplier: round(growthMult, 4),
      tenure_multiplier: round(tenureMult, 4),
      chain_multiplier: round(chainMult, 4),
      age_days: age,
      age_used_days: ageUsed,
    },
  };
}

/** No token on record means all three index fields are null; it is not a claim that none exists. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** A rankable row is pre-token and not a wrapper, a version pool, an exchange or a bridged product. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p)
    && p.name.length > 0
    && !VERSIONED.test(p.name)
    && !DERIVED.test(p.name)
    && !EXCHANGE_PREFIX.test(p.name)
    && (p.category === null || !EXCLUDED_CATEGORY.test(p.category));
}

/** Gas and position size come only from the protocol's own chain list and TVL. */
function gasFor(chains: string[]): number {
  const text = chains.join(' ').toLowerCase();
  if (text.includes('ethereum')) return 12;
  if (/\b(base|arbitrum|optimism|scroll|linea|zksync|polygon|avalanche)\b/.test(text)) return 2;
  if (text.includes('solana')) return 1;
  return 4;
}

function capitalFor(tvl: number): number {
  if (tvl >= 5_000_000_000) return 300;
  if (tvl >= 1_000_000_000) return 200;
  if (tvl >= 250_000_000) return 120;
  if (tvl >= 50_000_000) return 75;
  return 40;
}

function holdFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 75;
  if (age < 540) return 60;
  return 45;
}

function firstChain(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its primary chain';
}

/** The primary on-chain action, chosen by the category DefiLlama records. */
function primaryAction(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (/lend|cdp|collateral/.test(c)) return `Supply $${capital} of USDC into ${name}'s main lending market on ${chain} and borrow a small amount against it.`;
  if (/dex|yield|farm|amm/.test(c)) return `Provide $${capital} of two-sided liquidity to ${name}'s deepest pool on ${chain}; record both token amounts at entry.`;
  if (/perp|deriv|leverag/.test(c)) return `Deposit $${capital} of USDC as margin on ${name} on ${chain} and open one small, fully collateralised position.`;
  if (/staking|restak/.test(c)) return `Stake $${capital} of the chain's native staking asset through ${name} on ${chain} and keep the receipt token.`;
  if (/bridge/.test(c)) return `Move $${capital} of USDC to ${chain} through ${name} and use the bridged balance in one of its approved apps.`;
  if (/stable/.test(c)) return `Mint $${capital} of ${name}'s stable asset on ${chain} from an over-collateralised deposit.`;
  if (/rwa|curator|allocator/.test(c)) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the vault shares in the same wallet.`;
  if (/prediction/.test(c)) return `Fund $${capital} on ${chain} and take one small position through ${name}, then record the market and outcome.`;
  if (/insurance/.test(c)) return `Buy $${capital} of cover through ${name} on ${chain} and retain the policy receipt.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open in the same wallet.`;
}

/** A second, different action so the plan is more than a single deposit. */
function secondaryAction(p: SnapshotProtocol, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  if (/lend|cdp|collateral/.test(c)) return `Vote in one ${p.name} governance or parameter discussion if one is open, using the same wallet.`;
  if (/dex|amm|farm/.test(c)) return `Make one small swap through ${p.name} on ${chain} from the same wallet so a second action type is recorded.`;
  return `Use one other read-only or low-cost feature of ${p.name} on ${chain} from the same wallet, such as a points check or a portfolio view.`;
}

function step(stepText: string, cost: string, time: string): FarmStep {
  return { text: stepText, cost, time };
}

/** Six costed, timed steps, derived from the protocol record; never a promise of an airdrop. */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = firstChain(p);
  const capital = capitalFor(p.tvl_usd);
  const gas = gasFor(p.chains);
  const hold = holdFor(age);
  return [
    step(
      `Read ${p.name}'s own documentation, note that the index records no token, and fund one dedicated wallet on ${chain} with gas money. Do not use an exchange account or a wallet that holds your savings.`,
      `$${gas} for gas`,
      '10 minutes',
    ),
    step(
      primaryAction(p, capital, chain),
      `$${capital} of capital plus about $${gas} of gas`,
      '20 minutes to open the position',
    ),
    step(
      secondaryAction(p, chain),
      `about $${Math.max(1, Math.round(gas / 3))} of gas`,
      '10 minutes',
    ),
    step(
      `Once a week, make one small genuine action with the same wallet: add to the position, rebalance, vote or repay. Keep every transaction on ${chain} in one place.`,
      `about $${Math.max(1, Math.round(gas / 4))} a week`,
      '10 minutes a week',
    ),
    step(
      `Hold the position for ${hold} days and save dated screenshots of the balance on days 7 and ${hold}. Any future reward would be discretionary; none is implied by this plan.`,
      `$${capital} stays at risk`,
      `${hold} days`,
    ),
    step(
      `Before exiting, check ${p.name}'s own published rewards page and claim only through its official link; then record the realised cost, the gas spent and the outcome in your farm log.`,
      `about $${gas} to close`,
      '20 minutes',
    ),
  ];
}

/** One string per step with its cost and duration, inside the gate's 20..600 characters. */
export function stepText(s: FarmStep): string {
  let text = `${s.text} Cost: ${s.cost}. Time: ${s.time}.`;
  if (text.length > 600) text = `${text.slice(0, 596)}...`;
  if (text.length < 20) text += ' Keep the log and check the protocol directly.';
  return text;
}

/** The ranked pre-token board: the whole watchlist, then the strongest smaller protocols. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = new Map(snapshot.protocols.map((p) => [p.slug, p]));
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => ({ p, ...scoreProtocol(p, snapshot.as_of, model) }));
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'no-token-on-record',
    age_days: s.parts.age_days,
    implied_value_usd: s.implied,
    model: s.parts,
    farm_steps: farmSteps(s.p, s.parts.age_days).map(stepText),
  }));
}

/** Token-bearing protocols are context, never rows in the hypothetical-value board. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && (p.category === null || !EXCLUDED_CATEGORY.test(p.category)))
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** The board rows as the page receives them, including the exact farm plan board.json carries. */
export function radarRow(row: BoardRow): RadarRow {
  const { gecko_id: _gecko, symbol: _symbol, token_status: _status, ...rest } = row;
  return rest;
}

/** Everything the dashboard renders, derived from one snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const watch = new Set(snapshot.watchlist);
  return {
    board,
    radar: {
      as_of: snapshot.as_of,
      source: snapshot.source,
      floor_usd: snapshot.floor_usd,
      model,
      model_version: MODEL_VERSION,
      watchlist_size: snapshot.watchlist.length,
      board_size: board.length,
      early_size: board.filter((r) => !watch.has(r.slug)).length,
      live_size: liveRows(snapshot).length,
      rows: board.map(radarRow),
      live: liveRows(snapshot),
    },
  };
}

/** The snapshot out of a file's text, refused unless it has the shape this model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}

/** A final guard on the shape the gate checks before the program writes anything. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `board misses ${missing.length} watchlist slug(s): ${missing.slice(0, 5).join(', ')}`;
  if (board.length < 100 || board.length > 4000) return `board has ${board.length} rows`;
  for (let i = 0; i < board.length; i++) {
    if (board[i]!.rank !== i + 1) return `rank ${i + 1} is ${board[i]!.rank}`;
    if (i > 0 && board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i}`;
    if (board[i]!.implied_value_usd <= 0 || board[i]!.implied_value_usd > 100_000_000_000_000) return `row ${i + 1} has an impossible implied value`;
    const steps = board[i]!.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${board[i]!.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${board[i]!.slug} has a farm step of ${s.length} characters`;
  }
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) return 'every row has the same implied value';
  return null;
}

/** One local script the page can read without a server or a network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
