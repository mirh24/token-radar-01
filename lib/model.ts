// lib/model.ts — the radar's value model, radar-3.
//
// One sealed snapshot in, one ranked board out. The board always covers the
// snapshot's whole watchlist, then adds the early pre-token protocols below the
// watchlist floor, ranked by TVL. A protocol counts as pre-token only when its
// snapshot entry records no token at all: no market cap, no CoinGecko id, no
// symbol. Live-token protocols are never ranked; they are kept apart and shown
// at their market value, because the board must never mix a market price with
// a model estimate.
//
// The implied value is derived from the snapshot's own numbers only, and no
// protocol name is ever special-cased — the same function scores every row:
//
//   category multiple — how the market already prices launches like this one:
//     the median market-cap-to-TVL ratio of the snapshot's live-token
//     protocols in the same category, shrunk toward the global median with a
//     prior of 8 when the category has few comparables, and the global median
//     when it has none. Clamped to [0.05, 1.50]. A comparable only counts when
//     its own TVL is at or above the snapshot's floor: a protocol smaller than
//     the floor cannot price a launch, and one small protocol's ratio (a $6M
//     protocol trading at 400x its TVL) would otherwise set a whole category.
//     Each ratio is capped at 2x first: a token worth more than twice its
//     protocol's TVL is a chain token or a memecoin carried on the entry, not
//     the protocol's own pricing (Aave V2's entry carries the whole AAVE
//     market cap against a $91M legacy pool).
//   bias correction — the multiple is calibrated, not just shrunk: a
//     leave-one-out run over the live comparables measures the multiple's
//     median signed log error, and every multiple is multiplied by
//     exp(-bias) so the model's median prediction lands on the market's
//     median, not above it. The correction is one number for the whole board,
//     so it cannot change the ranking; it only stops the values overstating.
//   base          = tvl_usd * category_multiple * bias_correction
//   growth        = change_7d clamped to [-60, +120] per cent
//   growthMult    = 1 + (growth / 100) * 0.5
//   maturityMult  = 0.6 + min(age_days, 1095) / 1095 * 0.4   (age unknown: 365)
//   chainsMult    = 1 + 0.02 * min(chains - 1, 5)
//   implied       = max(1, round(base * growthMult * maturityMult * chainsMult))
//
// A category whose live tokens trade cheap against TVL gets a low multiple and
// one whose live tokens trade rich gets a high one, so the board prices a
// launch the way the market already prices launches like it.
//
// The model is TESTED, not asserted. Before the board is built, the same
// multiple runs a leave-one-out backtest over the snapshot's live-token
// protocols: each live token is predicted from the others in its category and
// the log error is recorded. The backtest reports the median absolute log
// error, the share of predictions within 2x and 1.5x, and the 80th-percentile
// error. The value band every row carries is the median error: band low =
// implied / band factor, band high = implied x band factor. A global size
// curve (log market cap on log TVL) is fitted as a cross-check, and the global
// multiple is bootstrapped 200 times so its spread is stated, not hidden.
//
// Every row also carries a farm verdict, netted to the dollar: the gas the
// plan costs over its holding window, the expected value at the band's low end
// for one qualifying wallet (stated openly as 0.01% of the launch's implied
// value there), and the net. FARM when the net clears $100, THIN when it
// clears $0, SKIP when the gas costs more than the expected share.

/** One protocol entry of the sealed snapshot: exactly its ten fields. */
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

/** The sealed snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's tunables, stated openly so the dashboard can show them. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
  chains_step: number;
  chains_max: number;
  shrink_prior: number;
  winsor_cap: number;
  multiple_floor: number;
  multiple_cap: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
  chains_step: 0.02,
  chains_max: 5,
  shrink_prior: 8,
  winsor_cap: 2,
  multiple_floor: 0.05,
  multiple_cap: 1.5,
};

/** The model's version label, named by the dashboard and the rules. */
export const MODEL_VERSION = 'radar-3';

/** How many pre-token protocols below the floor the early radar carries, by TVL. */
export const EARLY_ROWS = 186;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** The share of a launch's implied value one qualifying wallet is assumed to capture, at the band's low end. */
export const FARMER_SHARE = 0.0001;

/** A farm verdict is FARM when its net clears this many dollars. */
export const FARM_NET_THRESHOLD = 100;

/** Bootstrap resamples of the global multiple. */
export const BOOTSTRAP_SAMPLES = 200;

/** The bootstrap's fixed seed: the same snapshot always gives the same spread. */
export const BOOTSTRAP_SEED = 20261114;

/** One farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** A row's farm economics, netted to the dollar. */
export interface FarmEconomics {
  capital_usd: number;
  gas_total_usd: number;
  ev_low_usd: number;
  net_usd: number;
  verdict: 'FARM' | 'THIN' | 'SKIP';
}

/** One row of board.json. */
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
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  value_band_low_usd: number;
  value_band_high_usd: number;
  farm_economics: FarmEconomics;
  model: {
    category_multiple: number;
    comparables: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    chains_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** A board row in the compact form data.js carries; the page rebuilds the plan. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  value_band_low_usd: number;
  value_band_high_usd: number;
  verdict: 'FARM' | 'THIN' | 'SKIP';
  ev_low_usd: number;
  gas_total_usd: number;
  net_usd: number;
  category_multiple: number;
  comparables: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  chains_multiplier: number;
  watchlist: boolean;
}

/** A live-token protocol: it already trades, so the board shows the market's value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** One category's comparable multiple, for the dashboard's methodology table. */
export interface ComparableRow {
  category: string;
  comparables: number;
  median_multiple: number | null;
  multiple_used: number;
  loo_median_abs_log_err: number | null;
}

/** The leave-one-out backtest of the shipped multiple. */
export interface BacktestResult {
  n: number;
  bias_log: number;
  bias_correction: number;
  median_abs_log_err: number;
  median_error_factor: number;
  within_2x: number;
  within_1_5x: number;
  p80_abs_log_err: number;
  band_factor: number;
  per_category: { category: string; n: number; median_abs_log_err: number }[];
}

/** The global size curve as a cross-check on the multiple. */
export interface SizeCurveResult {
  n: number;
  slope: number;
  intercept: number;
  median_abs_log_err: number;
  median_error_factor: number;
  within_2x: number;
}

/** The bootstrap spread of the global multiple. */
export interface BootstrapResult {
  n: number;
  samples: number;
  median_multiple: number;
  p5: number;
  p95: number;
}

/** Everything the dashboard renders, built from the snapshot. */
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
  pre_token_audited: number;
  pre_token_rankable: number;
  global_multiple: number;
  backtest: BacktestResult;
  size_curve: SizeCurveResult;
  bootstrap: BootstrapResult;
  comparables: ComparableRow[];
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why a snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finiteOrFallback(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The median of a non-empty list. */
function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** A percentile of a sorted list, by nearest rank. */
function percentile(sorted: number[], q: number): number {
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[i]!;
}

/** Whole days from `listedAt` to `asOf`, at least zero; null when either date is missing or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Whether a protocol's entry records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** The live-token protocols the model prices with: not CEX, a market cap, TVL at or above the floor. */
export function liveComparables(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter(
    (p) => !isPreToken(p) && p.category !== 'CEX' && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd >= snapshot.floor_usd,
  );
}

/** The market's pricing by category: the global median and each category's shrunk multiple. */
export interface CategoryPricing {
  global: number;
  correction: number;
  byCategory: Map<string, { n: number; median: number | null; used: number }>;
}

/**
 * The market's own pricing by category, over an explicit list of live-token
 * protocols: for every category, the median market-cap-to-TVL ratio of the
 * protocols in it (each ratio capped at the model's winsor cap), shrunk toward
 * the global median when the category has few comparables, and the global
 * median when it has none. Every multiple is multiplied by `correction` (the
 * backtest's bias correction, 1 when uncalibrated) and clamped to the model's
 * [floor, cap].
 */
export function categoryPricingFor(
  live: SnapshotProtocol[],
  model: ModelConstants = MODEL,
  correction = 1,
): CategoryPricing {
  const global = median(live.map((p) => Math.min(p.mcap_usd! / p.tvl_usd, model.winsor_cap)));
  const perCat = new Map<string, number[]>();
  for (const p of live) {
    const key = p.category ?? 'Other';
    const list = perCat.get(key) ?? [];
    list.push(Math.min(p.mcap_usd! / p.tvl_usd, model.winsor_cap));
    perCat.set(key, list);
  }
  const byCategory = new Map<string, { n: number; median: number | null; used: number }>();
  const clamp = (v: number): number => Math.min(model.multiple_cap, Math.max(model.multiple_floor, v));
  for (const [key, values] of perCat) {
    const med = median(values);
    const used = clamp(((values.length * med + model.shrink_prior * global) / (values.length + model.shrink_prior)) * correction);
    byCategory.set(key, { n: values.length, median: med, used });
  }
  return { global, correction, byCategory };
}

/** The market's pricing over the snapshot's own live-token protocols. */
export function categoryPricing(snapshot: Snapshot, model: ModelConstants = MODEL, correction = 1): CategoryPricing {
  return categoryPricingFor(liveComparables(snapshot), model, correction);
}

/** The multiple one protocol's category gets: its shrunk median, or the global median. */
export function multipleForProtocol(
  p: SnapshotProtocol,
  pricing: CategoryPricing,
  model: ModelConstants = MODEL,
): { multiple: number; comparables: number } {
  const entry = pricing.byCategory.get(p.category ?? 'Other');
  if (entry === undefined) {
    // No live comparables in this category: the corrected global median.
    return { multiple: Math.min(model.multiple_cap, Math.max(model.multiple_floor, pricing.global * pricing.correction)), comparables: 0 };
  }
  return { multiple: entry.used, comparables: entry.n };
}

/** The growth, maturity and chains multipliers one protocol gets, plus its age in days. */
export function multipliersFor(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants = MODEL,
): { growthPct: number; growthMult: number; maturityMult: number; chainsMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finiteOrFallback(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  // Age unknown: the model's middle age, so an unlisted protocol is neither new nor seasoned.
  const ageForModel = age ?? model.unknown_age_days;
  const maturityMult =
    model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const chainsMult = 1 + model.chains_step * Math.min(Math.max(protocol.chains.length - 1, 0), model.chains_max);
  return { growthPct, growthMult, maturityMult, chainsMult, age };
}

/** The multipliers and the implied value one protocol gets under `model`. */
export function scoreProtocol(
  protocol: SnapshotProtocol,
  asOf: string,
  pricing: CategoryPricing,
  model: ModelConstants = MODEL,
): {
  implied: number;
  multiple: number;
  comparables: number;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  chainsMult: number;
  age: number | null;
} {
  const { multiple, comparables } = multipleForProtocol(protocol, pricing, model);
  const { growthPct, growthMult, maturityMult, chainsMult, age } = multipliersFor(protocol, asOf, model);
  const base = protocol.tvl_usd * multiple;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult * chainsMult));
  return { implied, multiple, comparables, growthPct, growthMult, maturityMult, chainsMult, age };
}

/**
 * The leave-one-out backtest of the shipped multiple. Pass 1 predicts each
 * live-token protocol from the others in its category and records the log
 * error; its median is the multiple's bias. Pass 2 repeats with every multiple
 * multiplied by exp(-bias), so the reported errors are the calibrated model's,
 * the same multiples the board ships. The band factor is the median absolute
 * error of pass 2: half the live tokens are predicted within it.
 */
export function backtestComps(snapshot: Snapshot, model: ModelConstants = MODEL): BacktestResult {
  const live = liveComparables(snapshot);
  const clamp = (v: number): number => Math.min(model.multiple_cap, Math.max(model.multiple_floor, v));
  const looMultiple = (p: SnapshotProtocol, others: SnapshotProtocol[], correction: number): number => {
    const g = median(others.map((q) => Math.min(q.mcap_usd! / q.tvl_usd, model.winsor_cap)));
    const same = others.filter((q) => (q.category ?? 'Other') === (p.category ?? 'Other'));
    if (same.length === 0) return clamp(g * correction);
    const med = median(same.map((q) => Math.min(q.mcap_usd! / q.tvl_usd, model.winsor_cap)));
    return clamp(((same.length * med + model.shrink_prior * g) / (same.length + model.shrink_prior)) * correction);
  };
  const pass1: { slug: string; category: string; err: number }[] = live.map((p) => {
    const others = live.filter((q) => q.slug !== p.slug);
    const mult = looMultiple(p, others, 1);
    return { slug: p.slug, category: p.category ?? 'Other', err: Math.log((p.tvl_usd * mult) / p.mcap_usd!) };
  });
  const bias = median(pass1.map((e) => e.err));
  const correction = Math.exp(-bias);
  const pass2 = pass1.map((e) => {
    const p = live.find((q) => q.slug === e.slug)!;
    const others = live.filter((q) => q.slug !== p.slug);
    const mult = looMultiple(p, others, correction);
    return { slug: e.slug, category: e.category, err: Math.log((p.tvl_usd * mult) / p.mcap_usd!) };
  });
  const absErrs = pass2.map((e) => Math.abs(e.err)).sort((a, b) => a - b);
  const medAbs = median(absErrs);
  const perCat = new Map<string, number[]>();
  for (const e of pass2) {
    const list = perCat.get(e.category) ?? [];
    list.push(Math.abs(e.err));
    perCat.set(e.category, list);
  }
  const perCategory = [...perCat.entries()]
    .filter(([, v]) => v.length >= 2)
    .map(([category, v]) => ({ category, n: v.length, median_abs_log_err: roundTo4dp(median(v)) }))
    .sort((a, b) => b.n - a.n || (a.category < b.category ? -1 : a.category > b.category ? 1 : 0));
  return {
    n: live.length,
    bias_log: roundTo4dp(bias),
    bias_correction: roundTo4dp(correction),
    median_abs_log_err: roundTo4dp(medAbs),
    median_error_factor: roundTo4dp(Math.exp(medAbs)),
    within_2x: roundTo4dp(pass2.filter((e) => Math.abs(e.err) < Math.log(2)).length / pass2.length),
    within_1_5x: roundTo4dp(pass2.filter((e) => Math.abs(e.err) < Math.log(1.5)).length / pass2.length),
    p80_abs_log_err: roundTo4dp(percentile(absErrs, 0.8)),
    band_factor: roundTo4dp(Math.exp(medAbs)),
    per_category: perCategory,
  };
}

/** Least squares for y = a + b x. */
function ols(xs: number[], ys: number[]): { a: number; b: number } {
  const n = xs.length;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i]! - mx) * (ys[i]! - my);
    sxx += (xs[i]! - mx) * (xs[i]! - mx);
  }
  const b = sxx === 0 ? 0 : sxy / sxx;
  return { a: my - b * mx, b };
}

/**
 * The global size curve as a cross-check: log market cap on log TVL over the
 * live comparables, fitted and tested leave-one-out. It asks whether the
 * multiple is an artifact of one functional form: a curve that prices the
 * same tokens within a similar error says the signal is in the snapshot, not
 * in the formula.
 */
export function sizeCurveCheck(snapshot: Snapshot): SizeCurveResult {
  const live = liveComparables(snapshot);
  const errs: number[] = live.map((p) => {
    const others = live.filter((q) => q.slug !== p.slug);
    const { a, b } = ols(
      others.map((q) => Math.log(q.tvl_usd)),
      others.map((q) => Math.log(q.mcap_usd!)),
    );
    return a + b * Math.log(p.tvl_usd) - Math.log(p.mcap_usd!);
  });
  const absErrs = errs.map((e) => Math.abs(e)).sort((a, b) => a - b);
  const medAbs = median(absErrs);
  const { a, b } = ols(
    live.map((q) => Math.log(q.tvl_usd)),
    live.map((q) => Math.log(q.mcap_usd!)),
  );
  return {
    n: live.length,
    slope: roundTo4dp(b),
    intercept: roundTo4dp(a),
    median_abs_log_err: roundTo4dp(medAbs),
    median_error_factor: roundTo4dp(Math.exp(medAbs)),
    within_2x: roundTo4dp(errs.filter((e) => Math.abs(e) < Math.log(2)).length / errs.length),
  };
}

/** A small deterministic generator (mulberry32): the same seed, the same draws, every run. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The bootstrap spread of the global multiple: the live ratios resampled with
 * replacement 200 times, the median taken each time. A multiple whose
 * resamples stay close is one a few rich tokens do not carry.
 */
export function bootstrapGlobalMultiple(snapshot: Snapshot, model: ModelConstants = MODEL): BootstrapResult {
  const live = liveComparables(snapshot);
  const ratios = live.map((p) => Math.min(p.mcap_usd! / p.tvl_usd, model.winsor_cap));
  const rnd = mulberry32(BOOTSTRAP_SEED);
  const draws: number[] = [];
  for (let i = 0; i < BOOTSTRAP_SAMPLES; i++) {
    const sample: number[] = [];
    for (let j = 0; j < ratios.length; j++) sample.push(ratios[Math.floor(rnd() * ratios.length)]!);
    draws.push(median(sample));
  }
  draws.sort((a, b) => a - b);
  return {
    n: live.length,
    samples: BOOTSTRAP_SAMPLES,
    median_multiple: roundTo4dp(median(ratios)),
    p5: roundTo4dp(percentile(draws, 0.05)),
    p95: roundTo4dp(percentile(draws, 0.95)),
  };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** The snapshot's protocols keyed by slug. */
function indexBySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The headline figures: watchlist size, board size, early rows, live protocols. */
export interface BoardSummary {
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
}

/** The value band one implied value carries: the backtest's median error either way. */
export function valueBandFor(implied: number, bandFactor: number): { low: number; high: number } {
  return { low: Math.max(1, Math.round(implied / bandFactor)), high: Math.round(implied * bandFactor) };
}

/** The gas a farm plan costs over its holding window, from the plan's own step costs. */
export function gasTotalUsd(capital: number, holdDays: number): number {
  const weeks = Math.ceil(holdDays / 7);
  return 3 + (capital >= 150 ? 8 : 4) + 2 * weeks;
}

/** A row's farm economics, netted to the dollar at the band's low end. */
export function farmEconomicsFor(implied: number, bandFactor: number, capital: number, holdDays: number): FarmEconomics {
  const bandLow = Math.max(1, Math.round(implied / bandFactor));
  const evLow = Math.floor(bandLow * FARMER_SHARE);
  const gas = gasTotalUsd(capital, holdDays);
  const net = evLow - gas;
  const verdict: FarmEconomics['verdict'] = net >= FARM_NET_THRESHOLD ? 'FARM' : net >= 0 ? 'THIN' : 'SKIP';
  return { capital_usd: capital, gas_total_usd: gas, ev_low_usd: evLow, net_usd: net, verdict };
}

/** A dollar figure as the page and the board both write it. */
export function fmtMoney(n: number): string {
  const v = Math.round(n);
  const abs = Math.abs(v).toLocaleString('en-US');
  return v < 0 ? `-$${abs}` : `$${abs}`;
}

/** The plan's eighth step: the verdict, netted to the dollar. */
export function verdictStepText(econ: FarmEconomics, bandLow: number): string {
  const ev = fmtMoney(econ.ev_low_usd);
  const gas = fmtMoney(econ.gas_total_usd);
  const net = fmtMoney(econ.net_usd);
  const band = fmtMoney(bandLow);
  const shared = `At the low end of the value band this launch is worth ${band}; one qualifying wallet capturing 0.01% of it expects ${ev} against ${gas} of gas, a net of ${net}.`;
  if (econ.verdict === 'FARM') return `Verdict: FARM. ${shared} Farm it.`;
  if (econ.verdict === 'THIN') return `Verdict: THIN. ${shared} Only farm it if you already use the protocol.`;
  return `Verdict: SKIP. ${shared} The gas costs more than the expected share - skip it.`;
}

/** The board: every watchlist slug plus the early rows, strongest first, ranks 1..n. */
export function buildBoard(
  snapshot: Snapshot,
  model: ModelConstants = MODEL,
  backtest: BacktestResult | null = null,
): BoardRow[] {
  const test = backtest ?? backtestComps(snapshot, model);
  const pricing = categoryPricing(snapshot, model, test.bias_correction);
  const protocolBySlug = indexBySlug(snapshot.protocols);
  const selected = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug it names, even one the snapshot no
  // longer carries (it cannot, but coverage is the gate's row and is never
  // gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = protocolBySlug.get(slug);
    if (p !== undefined) selected.set(slug, p);
  }
  // The early radar: pre-token protocols below the watchlist floor, by TVL,
  // capped. Never a replacement for a watchlist row: a selected protocol stays selected.
  const earlyPicks = snapshot.protocols
    .filter((p) => !selected.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of earlyPicks) selected.set(p.slug, p);

  // Score every selected protocol, then rank strongest first; ties break by slug
  // so the order is the same on every run.
  const rankedEntries = [...selected.values()].map((p) => {
    const v = scoreProtocol(p, snapshot.as_of, pricing, model);
    const band = valueBandFor(v.implied, test.band_factor);
    const capital = capitalForPosition(p);
    const hold = holdingDaysFor(v.age);
    const econ = farmEconomicsFor(v.implied, test.band_factor, capital, hold);
    return { p, ...v, band, econ };
  });
  rankedEntries.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return rankedEntries.map((entry, i) => ({
    rank: i + 1,
    slug: entry.p.slug,
    name: entry.p.name,
    category: entry.p.category,
    chains: entry.p.chains,
    tvl_usd: entry.p.tvl_usd,
    change_7d: entry.p.change_7d,
    mcap_usd: entry.p.mcap_usd,
    listed_at: entry.p.listed_at,
    gecko_id: entry.p.gecko_id,
    symbol: entry.p.symbol,
    token_status: 'pre-token',
    age_days: entry.age,
    implied_value_usd: entry.implied,
    value_band_low_usd: entry.band.low,
    value_band_high_usd: entry.band.high,
    farm_economics: entry.econ,
    model: {
      category_multiple: roundTo4dp(entry.multiple),
      comparables: entry.comparables,
      growth_pct: entry.growthPct,
      growth_multiplier: roundTo4dp(entry.growthMult),
      maturity_multiplier: roundTo4dp(entry.maturityMult),
      chains_multiplier: roundTo4dp(entry.chainsMult),
      age_days: entry.age,
    },
    farm_steps: farmSteps(entry.p, entry.age, entry.econ, entry.band.low),
  }));
}

const roundTo4dp = (n: number): number => Math.round(n * 1e4) / 1e4;

/** One step as a single string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function primaryChain(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalForPosition(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdingDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one action, in words a farmer can follow. */
function actionTextFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('risk curator') || c.includes('curator') || c.includes('allocator') || c.includes('capital allocator')) {
    return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  }
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) {
    return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  }
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) {
    return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  }
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) {
    return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  }
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('basis')) {
    return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  }
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  if (c.includes('payment')) return `Pay $${capital} through ${name} on ${chain} and keep the receipt.`;
  if (c.includes('governance')) return `Deposit $${capital} into ${name} on ${chain} and vote on one proposal.`;
  if (c.includes('chain') || c.includes('liquid')) {
    return `Use $${capital} of ${name} on ${chain} for one full round trip and keep the receipt.`;
  }
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/**
 * A protocol's farm plan: eight steps, each an action with a cost and a time,
 * and the eighth the verdict netted to the dollar. The plan is derived from
 * the protocol's own record (category, chains, TVL, age) and the row's own
 * economics, never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, econ: FarmEconomics, bandLow: number): string[] {
  const chain = primaryChain(p);
  const capital = capitalForPosition(p);
  const hold = holdingDaysFor(age);
  const action = actionTextFor(p, capital, chain);
  const steps: FarmStep[] = [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Open the protocol's own points or rewards page once a week and check whether your activity is counted.`,
      cost: 'no fee to check',
      time: '5 minutes a week',
    },
    {
      text: `Before you withdraw, claim only from the link the protocol itself publishes, and never pay anyone to claim for you.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
  return [...steps.map(stepText), verdictStepText(econ, bandLow)];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveTokenRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
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

/** A board row's compact form for data.js; the farm plan is generated in the page. */
export function compactRow(row: BoardRow, watchlist: boolean): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    value_band_low_usd: row.value_band_low_usd,
    value_band_high_usd: row.value_band_high_usd,
    verdict: row.farm_economics.verdict,
    ev_low_usd: row.farm_economics.ev_low_usd,
    gas_total_usd: row.farm_economics.gas_total_usd,
    net_usd: row.farm_economics.net_usd,
    category_multiple: row.model.category_multiple,
    comparables: row.model.comparables,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    chains_multiplier: row.model.chains_multiplier,
    watchlist,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const backtest = backtestComps(snapshot, model);
  const board = buildBoard(snapshot, model, backtest);
  const live = liveTokenRows(snapshot);
  const pricing = categoryPricing(snapshot, model, backtest.bias_correction);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const looByCat = new Map(backtest.per_category.map((c) => [c.category, c.median_abs_log_err]));
  // One row per category that has live comparables, most comparables first.
  const comparableRows: ComparableRow[] = [...pricing.byCategory.entries()]
    .map(([category, v]) => ({
      category,
      comparables: v.n,
      median_multiple: roundTo4dp(v.median ?? 0) || null,
      multiple_used: roundTo4dp(v.used),
      loo_median_abs_log_err: looByCat.get(category) ?? null,
    }))
    .sort((a, b) => b.comparables - a.comparables || (a.category < b.category ? -1 : a.category > b.category ? 1 : 0));
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    pre_token_audited: snapshot.protocols.filter(isPreToken).length,
    pre_token_rankable: snapshot.protocols.filter(isRankable).length,
    global_multiple: roundTo4dp(pricing.global),
    backtest,
    size_curve: sizeCurveCheck(snapshot),
    bootstrap: bootstrapGlobalMultiple(snapshot, model),
    comparables: comparableRows,
    rows: board.map((r) => compactRow(r, snapshot.watchlist.includes(r.slug))),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new SnapshotError('snapshot.json is not a JSON object');
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) {
    throw new SnapshotError('snapshot.json has no as_of date');
  }
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) {
    throw new SnapshotError('snapshot.json has no floor_usd');
  }
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) {
    throw new SnapshotError('snapshot.json has no watchlist of slugs');
  }
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    }
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
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
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared value, farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) {
    return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  }
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) {
    if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  }
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) {
      return `${r.slug} has implied value ${r.implied_value_usd}`;
    }
    if (r.value_band_low_usd <= 0 || r.value_band_high_usd < r.value_band_low_usd) {
      return `${r.slug} has a broken value band`;
    }
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
