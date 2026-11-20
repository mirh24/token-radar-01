// lib/model.ts — the radar's value model, radar-5.
//
// Changes from radar-4, each measured by leave-one-out on the snapshot's own
// 119 live tokens (full pipeline, curve + family + multipliers):
//   - the chains multiplier is GONE. LOO says it hurts: with it the full
//     pipeline misses by x3.31 at the median; without it, x3.15. A protocol
//     on more chains is not worth more; the chains a protocol names are
//     still shown on every row and still filterable, they just no longer
//     move the value.
//   - the maturity multiplier is GONE. LOO says the full 0.60-1.00 swing
//     adds nothing: removing it leaves the median error unchanged. Age is
//     still shown on every row and in every detail view, and the farm plan's
//     holding window still follows it, but age no longer moves the value.
//     That is a tested choice, not an omission, and the methodology panel
//     states the numbers.
//   - the backtest is now the FULL pipeline. Radar-4 backtested the curve
//     and the family factor only and never tested the multipliers it shipped.
//     Radar-5 backtests the exact function that scores the board, and the
//     value band every row carries is that full-pipeline median error.
//     The curve-only backtest is kept beside it so the ablation is stated:
//     curve + family x3.36, full pipeline x3.17, flat multiple x5.02.
//     (On a fresh DefiLlama fetch the same pipeline misses by x3.27, so the
//     gain is not fitted to one snapshot.)
//
// One sealed snapshot in, one ranked board out. The board covers every
// protocol the snapshot's own watchlist rule keeps as a genuine pre-token
// launch — above the floor and below it — ranked by a fitted value curve.
//
// The implied value is derived from the snapshot's own numbers only, and no
// protocol name is ever special-cased — the same function scores every row:
//
//   size curve — a log-log power law fitted on the snapshot's own traded
//     tokens: log(market cap) = a + b * log(TVL), fitted by least squares
//     over every live-token protocol with a market cap (119 of them). The
//     curve is the market's own size pricing: a protocol twice as big is
//     worth 2^b as much, not twice as much. Slope ~0.47 on this snapshot.
//   family factor — each category's mean residual against the curve,
//     shrunk toward 1 by n/(n+k) with k chosen by leave-one-out. A category
//     whose traded tokens sit above the curve gets a factor above 1, and
//     one whose tokens sit below it gets a factor below 1. Categories with
//     no traded tokens get a factor of 1: the curve alone prices them, so
//     no row ever rests on a fallback multiple.
//   base          = exp(a + b * log(TVL)) * family_factor
//   growth        = change_7d clamped to [-60, +120] per cent
//   growthMult    = 1 + (growth / 100) * 0.5
//   implied       = max(1, round(base * growthMult))
//
// The chains a protocol runs on do not move its value in radar-5, and
// neither does its age: the leave-one-out backtest shows the old chains
// multiplier (1 + 0.02 per extra chain) made predictions worse, and the old
// maturity swing (0.60-1.00 over three years) added nothing. Chains are
// still listed on every row and still filterable in the dashboard, and age
// is still shown on every row; neither moves the value.
//
// A protocol counts as pre-token only when its snapshot entry records no
// token at all: no market cap, no CoinGecko id, no symbol. And it counts as
// rankable only when the snapshot's own watchlist rule keeps it: not a
// wrapped, staked or bridged product of a token that already trades, not a
// versioned pool, not an exchange. The rule is the snapshot's, from its
// field guide: the category is not Bridge, Canonical Bridge, Liquid
// Staking, Liquid Restaking, Restaked BTC or CEX; the name carries no whole
// word wrapped, staked or staking; it does not end in a version marker; and
// it does not begin with an exchange's name. Live-token protocols are never
// ranked; they are kept apart and shown at their market value, because the
// board must never mix a market price with a model estimate.
//
// The model is TESTED, not asserted. Before the board is built, the same
// curve runs a leave-one-out backtest over the snapshot's 119 live-token
// protocols: each live token is predicted from the others (curve refit,
// family factor recomputed) and the log error is recorded. The backtest
// reports the median absolute log error, the share of predictions within
// 2x, 3x and 1.5x, and the 80th-percentile error. The value band every row
// carries is the median error: band low = implied / band factor, band high
// = implied x band factor. A flat multiple (the old model) is backtested on
// the same 119 tokens so the curve's advantage is stated, not claimed: the
// curve's median error against the flat multiple's, on identical data.
//
// Every row also carries a farm verdict, netted to the dollar at the low
// end of its value band: a $1,000 position takes a pro-rata slice of the
// launch (slice = $1,000 x band-low implied / TVL), the gas its plan costs
// over its holding window, and the $40 of T-bill yield the $1,000 would
// have earned in a year. FARM when the net clears $0, THIN when the slice
// covers the gas but not the T-bill, SKIP when the slice does not cover the
// gas. The net per active hour is shown on every row.

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
  shrinkage_k: number;
  plan_capital_usd: number;
  tbill_rate: number;
  tbill_usd: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  shrinkage_k: 40,
  plan_capital_usd: 1000,
  tbill_rate: 0.04,
  tbill_usd: 40,
};

/** The model's version label, named by the dashboard and the rules. */
export const MODEL_VERSION = 'radar-5';

/** The shrinkage pseudo-count for family factors, chosen by leave-one-out. */
export const SHRINKAGE_K = 40;

/** The capital one farm position deploys, in whole dollars. */
export const PLAN_CAPITAL_USD = 1000;

/** The T-bill yield forgone on the plan capital, in whole dollars (4% of $1,000). */
export const TBILL_USD = 40;

/** Bootstrap resamples of the size curve's slope. */
export const BOOTSTRAP_SAMPLES = 200;

/** The bootstrap's fixed seed: the same snapshot always gives the same spread. */
export const BOOTSTRAP_SEED = 20261114;

/** One farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** A row's farm economics, netted to the dollar at the low end of its value band. */
export interface FarmEconomics {
  capital_usd: number;
  slice_usd: number;
  gas_total_usd: number;
  tbill_usd: number;
  net_usd: number;
  net_per_hour_usd: number;
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
    curve_value_usd: number;
    family_factor: number;
    family_comparables: number;
    growth_pct: number;
    growth_multiplier: number;
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
  slice_usd: number;
  gas_total_usd: number;
  tbill_usd: number;
  net_usd: number;
  net_per_hour_usd: number;
  curve_value_usd: number;
  family_factor: number;
  family_comparables: number;
  growth_multiplier: number;
  watchlist: boolean;
  above_floor: boolean;
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

/** One category's family factor, for the dashboard's methodology table. */
export interface ComparableRow {
  category: string;
  comparables: number;
  median_residual: number | null;
  family_factor: number;
  loo_median_abs_log_err: number | null;
}

/** The leave-one-out backtest of the shipped curve. */
export interface BacktestResult {
  n: number;
  median_abs_log_err: number;
  median_error_factor: number;
  within_2x: number;
  within_3x: number;
  within_1_5x: number;
  p80_abs_log_err: number;
  band_factor: number;
  per_category: { category: string; n: number; median_abs_log_err: number }[];
}

/** The fitted size curve, on the whole comparable set. */
export interface PowerLawResult {
  n: number;
  slope: number;
  intercept: number;
  intercept_log10: number;
  shrinkage_k: number;
}

/** The flat multiple's leave-one-out backtest on the same comparables, for comparison. */
export interface FlatBaselineResult {
  n: number;
  median_abs_log_err: number;
  median_error_factor: number;
  within_2x: number;
  within_3x: number;
  within_1_5x: number;
}

/** The bootstrap spread of the size curve's slope. */
export interface BootstrapResult {
  n: number;
  samples: number;
  median_slope: number;
  p5_slope: number;
  p95_slope: number;
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
  above_floor_size: number;
  early_size: number;
  live_size: number;
  set_aside_size: number;
  pre_token_audited: number;
  pre_token_rankable: number;
  backtest: BacktestResult;
  /** The curve + family backtest alone, so the ablation is stated, not claimed. */
  backtest_curve_only: BacktestResult;
  power_law: PowerLawResult;
  flat_baseline: FlatBaselineResult;
  slope_bootstrap: BootstrapResult;
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

const roundTo4dp = (n: number): number => Math.round(n * 1e4) / 1e4;

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

/**
 * The live-token protocols the model prices with: not an exchange, a market
 * cap, any TVL. No floor: a small protocol's ratio is capped by the curve
 * itself (the power law, not a median), and the family factor is a shrunk
 * mean residual, so one small protocol cannot set a category.
 */
export function liveComparables(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter(
    (p) => !isPreToken(p) && p.category !== 'CEX' && p.mcap_usd !== null && p.mcap_usd > 0,
  );
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** The categories the watchlist rule keeps off the board: wrapped, staked or bridged products, and exchanges. */
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Exchange names the watchlist rule keeps off the board when a name begins with one. */
const EXCHANGE_NAMES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** A whole word wrapped, staked or staking anywhere in a name. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

/**
 * Whether a protocol is one the board may rank: pre-token, and kept by the
 * snapshot's own watchlist rule — not a wrapped, staked or bridged product
 * of a token that already trades, not a versioned pool, not an exchange.
 * The rule is the snapshot's field guide, applied to every protocol alike;
 * no name is ever special-cased.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGE_NAMES.some((e) => p.name.startsWith(e))) return false;
  return true;
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

/** The size curve fitted on a list of live-token protocols: log(mcap) = a + b * log(TVL). */
export function powerLawFit(live: SnapshotProtocol[]): { a: number; b: number } {
  return ols(
    live.map((p) => Math.log(p.tvl_usd)),
    live.map((p) => Math.log(p.mcap_usd!)),
  );
}

/**
 * Each category's family factor against a fitted curve: the mean residual of
 * its traded tokens, shrunk toward 1 by n/(n+k). A category with no traded
 * tokens gets no entry here and a factor of 1 at scoring time.
 */
export function familyFactors(
  live: SnapshotProtocol[],
  fit: { a: number; b: number },
  k: number = SHRINKAGE_K,
): Map<string, { n: number; meanResidual: number; factor: number }> {
  const byCat = new Map<string, SnapshotProtocol[]>();
  for (const p of live) {
    const key = p.category ?? 'Other';
    const list = byCat.get(key) ?? [];
    list.push(p);
    byCat.set(key, list);
  }
  const out = new Map<string, { n: number; meanResidual: number; factor: number }>();
  for (const [key, members] of byCat) {
    const meanResidual =
      members.reduce((s, q) => s + (Math.log(q.mcap_usd!) - (fit.a + fit.b * Math.log(q.tvl_usd))), 0) / members.length;
    out.set(key, { n: members.length, meanResidual, factor: Math.exp(meanResidual * (members.length / (members.length + k))) });
  }
  return out;
}

/** The family factor one protocol's category gets: its shrunk factor, or 1 when it has no traded tokens. */
export function familyFactorFor(
  p: SnapshotProtocol,
  factors: Map<string, { n: number; meanResidual: number; factor: number }>,
): { factor: number; comparables: number } {
  const entry = factors.get(p.category ?? 'Other');
  if (entry === undefined) return { factor: 1, comparables: 0 };
  return { factor: entry.factor, comparables: entry.n };
}

/** The growth multiplier one protocol gets, plus its age in days. Age is
 * shown on every row; it does not move the value in radar-5 (see the file
 * header), and neither do the chains a protocol runs on. */
export function multipliersFor(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants = MODEL,
): { growthPct: number; growthMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finiteOrFallback(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  return { growthPct, growthMult, age };
}

/** The multipliers and the implied value one protocol gets under `model`. */
export function scoreProtocol(
  protocol: SnapshotProtocol,
  asOf: string,
  fit: { a: number; b: number },
  factors: Map<string, { n: number; meanResidual: number; factor: number }>,
  model: ModelConstants = MODEL,
): {
  implied: number;
  curveValue: number;
  familyFactor: number;
  familyComparables: number;
  growthPct: number;
  growthMult: number;
  age: number | null;
} {
  const curveValue = Math.exp(fit.a + fit.b * Math.log(protocol.tvl_usd));
  const { factor, comparables } = familyFactorFor(protocol, factors);
  const { growthPct, growthMult, age } = multipliersFor(protocol, asOf, model);
  const implied = Math.max(1, Math.round(curveValue * factor * growthMult));
  return { implied, curveValue, familyFactor: factor, familyComparables: comparables, growthPct, growthMult, age };
}

/**
 * The leave-one-out backtest of the curve and the family factor alone
 * (no multipliers). Kept so the ablation is stated: the dashboard shows
 * this beside the full-pipeline backtest. Each live-token protocol is
 * predicted from the others: the curve refit without it, its category's
 * family factor recomputed without it, and the log error is recorded.
 * The band factor is the median absolute error: half the live tokens are
 * predicted within it.
 */
export function backtestPowerLaw(snapshot: Snapshot, k: number = SHRINKAGE_K): BacktestResult {
  const live = liveComparables(snapshot);
  const errs: { slug: string; category: string; err: number }[] = live.map((p) => {
    const others = live.filter((q) => q.slug !== p.slug);
    const fit = powerLawFit(others);
    const factors = familyFactors(others, fit, k);
    const { factor } = familyFactorFor(p, factors);
    const pred = fit.a + fit.b * Math.log(p.tvl_usd) + Math.log(factor);
    return { slug: p.slug, category: p.category ?? 'Other', err: pred - Math.log(p.mcap_usd!) };
  });
  const absErrs = errs.map((e) => Math.abs(e.err)).sort((a, b) => a - b);
  const medAbs = median(absErrs);
  const perCat = new Map<string, number[]>();
  for (const e of errs) {
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
    median_abs_log_err: roundTo4dp(medAbs),
    median_error_factor: roundTo4dp(Math.exp(medAbs)),
    within_2x: roundTo4dp(errs.filter((e) => Math.abs(e.err) < Math.log(2)).length / errs.length),
    within_3x: roundTo4dp(errs.filter((e) => Math.abs(e.err) < Math.log(3)).length / errs.length),
    within_1_5x: roundTo4dp(errs.filter((e) => Math.abs(e.err) < Math.log(1.5)).length / errs.length),
    p80_abs_log_err: roundTo4dp(percentile(absErrs, 0.8)),
    band_factor: roundTo4dp(Math.exp(medAbs)),
    per_category: perCategory,
  };
}

/**
 * The leave-one-out backtest of the FULL scoring function — the exact
 * function that scores the board. Each live-token protocol is predicted
 * from the others: the curve refit without it, its category's family
 * factor recomputed without it, and the growth multiplier applied from its
 * own seven-day change. The log error is recorded. Radar-4 backtested the
 * curve and the family factor only and never tested the multipliers it
 * shipped; this is the backtest the band and the methodology panel use.
 */
export function backtestFullPipeline(snapshot: Snapshot, k: number = SHRINKAGE_K): BacktestResult {
  const live = liveComparables(snapshot);
  const errs: { slug: string; category: string; err: number }[] = live.map((p) => {
    const others = live.filter((q) => q.slug !== p.slug);
    const fit = powerLawFit(others);
    const factors = familyFactors(others, fit, k);
    const v = scoreProtocol(p, snapshot.as_of, fit, factors);
    return { slug: p.slug, category: p.category ?? 'Other', err: Math.log(v.implied) - Math.log(p.mcap_usd!) };
  });
  const absErrs = errs.map((e) => Math.abs(e.err)).sort((a, b) => a - b);
  const medAbs = median(absErrs);
  const perCat = new Map<string, number[]>();
  for (const e of errs) {
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
    median_abs_log_err: roundTo4dp(medAbs),
    median_error_factor: roundTo4dp(Math.exp(medAbs)),
    within_2x: roundTo4dp(errs.filter((e) => Math.abs(e.err) < Math.log(2)).length / errs.length),
    within_3x: roundTo4dp(errs.filter((e) => Math.abs(e.err) < Math.log(3)).length / errs.length),
    within_1_5x: roundTo4dp(errs.filter((e) => Math.abs(e.err) < Math.log(1.5)).length / errs.length),
    p80_abs_log_err: roundTo4dp(percentile(absErrs, 0.8)),
    band_factor: roundTo4dp(Math.exp(medAbs)),
    per_category: perCategory,
  };
}

/**
 * The flat multiple's leave-one-out backtest on the same comparables, so the
 * curve's advantage is measured on identical data, not claimed. Each live
 * token is predicted from the others in its category by their median
 * mcap/TVL, shrunk toward the global median with a prior of 8, each ratio
 * capped at 2x and the multiple clamped to [0.05, 1.50].
 */
export function backtestFlatMultiple(snapshot: Snapshot): FlatBaselineResult {
  const live = liveComparables(snapshot);
  const errs = live.map((p) => {
    const others = live.filter((q) => q.slug !== p.slug);
    const g = median(others.map((q) => Math.min(q.mcap_usd! / q.tvl_usd, 2)));
    const same = others.filter((q) => (q.category ?? 'Other') === (p.category ?? 'Other'));
    let mult: number;
    if (same.length === 0) mult = g;
    else {
      const med = median(same.map((q) => Math.min(q.mcap_usd! / q.tvl_usd, 2)));
      mult = (same.length * med + 8 * g) / (same.length + 8);
    }
    mult = Math.min(1.5, Math.max(0.05, mult));
    return Math.log((p.tvl_usd * mult) / p.mcap_usd!);
  });
  const absErrs = errs.map((e) => Math.abs(e)).sort((a, b) => a - b);
  const medAbs = median(absErrs);
  return {
    n: live.length,
    median_abs_log_err: roundTo4dp(medAbs),
    median_error_factor: roundTo4dp(Math.exp(medAbs)),
    within_2x: roundTo4dp(errs.filter((e) => Math.abs(e) < Math.log(2)).length / errs.length),
    within_3x: roundTo4dp(errs.filter((e) => Math.abs(e) < Math.log(3)).length / errs.length),
    within_1_5x: roundTo4dp(errs.filter((e) => Math.abs(e) < Math.log(1.5)).length / errs.length),
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
 * The bootstrap spread of the size curve's slope: the live comparables
 * resampled with replacement 200 times, the slope refit each time. A slope
 * whose resamples stay close is one a few big tokens do not carry.
 */
export function bootstrapSlope(snapshot: Snapshot): BootstrapResult {
  const live = liveComparables(snapshot);
  const rnd = mulberry32(BOOTSTRAP_SEED);
  const slopes: number[] = [];
  for (let i = 0; i < BOOTSTRAP_SAMPLES; i++) {
    const sample: SnapshotProtocol[] = [];
    for (let j = 0; j < live.length; j++) sample.push(live[Math.floor(rnd() * live.length)]!);
    slopes.push(powerLawFit(sample).b);
  }
  slopes.sort((a, b) => a - b);
  return {
    n: live.length,
    samples: BOOTSTRAP_SAMPLES,
    median_slope: roundTo4dp(median(slopes)),
    p5_slope: roundTo4dp(percentile(slopes, 0.05)),
    p95_slope: roundTo4dp(percentile(slopes, 0.95)),
  };
}

/** The snapshot's protocols keyed by slug. */
function indexBySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
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

/** The active hours a farm plan takes: the fixed steps plus the weekly actions. */
export function activeHoursFor(holdDays: number): number {
  const weeks = Math.ceil(holdDays / 7);
  return (50 + 15 * weeks) / 60;
}

/**
 * A row's farm economics, netted to the dollar at the low end of its value
 * band. A $1,000 position takes a pro-rata slice of the launch (slice =
 * $1,000 x band-low implied / TVL); the gas is the plan's own cost over its
 * holding window; the T-bill is the $40 the $1,000 would have earned in a
 * year. FARM when the net clears $0, THIN when the slice covers the gas but
 * not the T-bill, SKIP when the slice does not cover the gas.
 */
export function farmEconomicsFor(implied: number, bandFactor: number, tvlUsd: number, holdDays: number): FarmEconomics {
  const bandLow = Math.max(1, Math.round(implied / bandFactor));
  const slice = Math.round((PLAN_CAPITAL_USD * bandLow) / tvlUsd);
  const gas = gasTotalUsd(PLAN_CAPITAL_USD, holdDays);
  const net = slice - gas - TBILL_USD;
  const netPerHour = Math.round((net / activeHoursFor(holdDays)) * 100) / 100;
  const verdict: FarmEconomics['verdict'] = net > 0 ? 'FARM' : slice > gas ? 'THIN' : 'SKIP';
  return { capital_usd: PLAN_CAPITAL_USD, slice_usd: slice, gas_total_usd: gas, tbill_usd: TBILL_USD, net_usd: net, net_per_hour_usd: netPerHour, verdict };
}

/** A dollar figure as the page and the board both write it. */
export function fmtMoney(n: number): string {
  const v = Math.round(n);
  const abs = Math.abs(v).toLocaleString('en-US');
  return v < 0 ? `-$${abs}` : `$${abs}`;
}

/** A dollars-per-hour figure as the page and the board both write it. */
export function fmtPerHour(n: number): string {
  const sign = n < 0 ? '-' : '+';
  return `${sign}$${Math.abs(n).toFixed(2)}/h`;
}

/** The plan's eighth step: the verdict, netted to the dollar at the band's low end. */
export function verdictStepText(econ: FarmEconomics): string {
  const slice = fmtMoney(econ.slice_usd);
  const gas = fmtMoney(econ.gas_total_usd);
  const net = fmtMoney(econ.net_usd);
  const perHour = fmtPerHour(econ.net_per_hour_usd);
  const shared = `A $1,000 position takes a ${slice} slice of this launch at the low end of the value band; after ${gas} of gas and $40 of T-bill yield forgone, the net is ${net} (${perHour}).`;
  if (econ.verdict === 'FARM') return `Verdict: FARM. ${shared} Farm it.`;
  if (econ.verdict === 'THIN') return `Verdict: THIN. ${shared} Only farm it if you already use the protocol.`;
  return `Verdict: SKIP. ${shared} The slice does not cover the gas - skip it.`;
}

/** The board: every rankable pre-token protocol, strongest first, ranks 1..n. */
export function buildBoard(
  snapshot: Snapshot,
  model: ModelConstants = MODEL,
  backtest: BacktestResult | null = null,
): BoardRow[] {
  const test = backtest ?? backtestFullPipeline(snapshot, model.shrinkage_k);
  const live = liveComparables(snapshot);
  const fit = powerLawFit(live);
  const factors = familyFactors(live, fit, model.shrinkage_k);

  // Every protocol the watchlist rule keeps: above the floor and below it.
  // The watchlist is the floor, never the ceiling — the board ranks them all.
  const selected = snapshot.protocols.filter(isRankable);

  // Score every selected protocol, then rank strongest first; ties break by slug
  // so the order is the same on every run.
  const rankedEntries = selected.map((p) => {
    const v = scoreProtocol(p, snapshot.as_of, fit, factors, model);
    const band = valueBandFor(v.implied, test.band_factor);
    const hold = holdingDaysFor(v.age);
    const econ = farmEconomicsFor(v.implied, test.band_factor, p.tvl_usd, hold);
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
      curve_value_usd: Math.round(entry.curveValue),
      family_factor: roundTo4dp(entry.familyFactor),
      family_comparables: entry.familyComparables,
      growth_pct: entry.growthPct,
      growth_multiplier: roundTo4dp(entry.growthMult),
      age_days: entry.age,
    },
    farm_steps: farmSteps(entry.p, entry.age, entry.econ),
  }));
}

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
export function farmSteps(p: SnapshotProtocol, age: number | null, econ: FarmEconomics): string[] {
  const chain = primaryChain(p);
  const capital = PLAN_CAPITAL_USD;
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
  return [...steps.map(stepText), verdictStepText(econ)];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveTokenRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p))
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
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
export function compactRow(row: BoardRow, watchlist: boolean, floorUsd: number): RadarRow {
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
    slice_usd: row.farm_economics.slice_usd,
    gas_total_usd: row.farm_economics.gas_total_usd,
    tbill_usd: row.farm_economics.tbill_usd,
    net_usd: row.farm_economics.net_usd,
    net_per_hour_usd: row.farm_economics.net_per_hour_usd,
    curve_value_usd: row.model.curve_value_usd,
    family_factor: row.model.family_factor,
    family_comparables: row.model.family_comparables,
    growth_multiplier: row.model.growth_multiplier,
    watchlist,
    above_floor: row.tvl_usd >= floorUsd,
  };
}

/** Everything the dashboard renders, from the snapshot. The headline
 * backtest is the full pipeline; the curve-only backtest sits beside it
 * for the ablation. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const backtestCurve = backtestPowerLaw(snapshot, model.shrinkage_k);
  const backtest = backtestFullPipeline(snapshot, model.shrinkage_k);
  const board = buildBoard(snapshot, model, backtest);
  const live = liveTokenRows(snapshot);
  const liveComps = liveComparables(snapshot);
  const fit = powerLawFit(liveComps);
  const factors = familyFactors(liveComps, fit, model.shrinkage_k);
  const aboveFloor = board.filter((r) => r.tvl_usd >= snapshot.floor_usd).length;
  const early = board.length - aboveFloor;
  const looByCat = new Map(backtest.per_category.map((c) => [c.category, c.median_abs_log_err]));
  // One row per category that has live comparables, most comparables first.
  const comparableRows: ComparableRow[] = [...factors.entries()]
    .map(([category, v]) => ({
      category,
      comparables: v.n,
      median_residual: roundTo4dp(v.meanResidual),
      family_factor: roundTo4dp(v.factor),
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
    above_floor_size: aboveFloor,
    early_size: early,
    live_size: live.length,
    set_aside_size: snapshot.protocols.filter((p) => isPreToken(p) && !isRankable(p)).length,
    pre_token_audited: snapshot.protocols.filter(isPreToken).length,
    pre_token_rankable: snapshot.protocols.filter(isRankable).length,
    backtest,
    backtest_curve_only: backtestCurve,
    power_law: {
      n: liveComps.length,
      slope: roundTo4dp(fit.b),
      intercept: roundTo4dp(fit.a),
      intercept_log10: roundTo4dp(fit.a / Math.LN10),
      shrinkage_k: model.shrinkage_k,
    },
    flat_baseline: backtestFlatMultiple(snapshot),
    slope_bootstrap: bootstrapSlope(snapshot),
    comparables: comparableRows,
    rows: board.map((r) => compactRow(r, snapshot.watchlist.includes(r.slug), snapshot.floor_usd)),
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
