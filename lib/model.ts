// Token Launch Radar v2: the board's universe and each protocol's valuation.
//
// A protocol that records no token is valued in two parts, both fitted on this snapshot (lib/fit.ts):
//
//   value_if_launch = TVL x exp( cap model )      what its token would be worth if it priced like the
//                                                 traded protocols of its size do today
//   odds            = token odds model            the share of protocols like it (age, category) that
//                                                 record a token: the peers' record, not a forecast
//   implied_value   = value_if_launch x odds
//
// The range around it is the cap model's own held-out misses (P25..P75, P10..P90), so a printed
// "50% range" is one that held about half the real caps when they were hidden from the fit.
// No protocol name is special-cased anywhere in this file.

import { ageYears, type CapModel, type OddsModel } from './fit.ts';

export interface Protocol {
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
  protocols: Protocol[];
  watchlist: string[];
}

export const MODEL_VERSION = 'fitted-3';

export const PARAMS = {
  min_tvl_usd: 5_000_000,
  cap_category_ridge: 4,
  odds_category_ridge: 8,
  wf_train_share: 0.6,
};

/** Categories that are not farmable protocols with a token of their own to come. */
const NOT_FARMABLE = new Set(['CEX', 'Canonical Bridge', 'Chain']);

export function hasToken(p: Protocol): boolean {
  return p.mcap_usd !== null || p.gecko_id !== null || p.symbol !== null;
}

const r4 = (x: number) => Math.round(x * 10_000) / 10_000;

export function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso}T00:00:00Z`);
  const b = Date.parse(`${toIso}T00:00:00Z`);
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

export interface Valuation {
  cap_ratio: number; // fitted mcap / TVL
  value_if_launch_usd: number;
  odds: number;
  implied_value_usd: number;
  p10_usd: number;
  p25_usd: number;
  p75_usd: number;
  p90_usd: number;
  days_without_token: number | null;
  age_years: number | null;
}

export function valueProtocol(p: Protocol, asOf: string, cap: CapModel, odds: OddsModel): Valuation {
  const logRatio = cap.predictLog(p);
  const ifLaunch = p.tvl_usd * Math.exp(logRatio);
  const o = odds.predict(p);
  const implied = Math.max(1, Math.round(ifLaunch * o));
  const at = (q: number) => Math.max(1, Math.round(ifLaunch * Math.exp(q) * o));
  const days = p.listed_at === null ? null : daysBetween(p.listed_at, asOf);
  const age = ageYears(p, asOf);
  return {
    cap_ratio: r4(Math.exp(logRatio)),
    value_if_launch_usd: Math.round(ifLaunch),
    odds: r4(o),
    implied_value_usd: implied,
    p10_usd: at(cap.bands.p10),
    p25_usd: at(cap.bands.p25),
    p75_usd: at(cap.bands.p75),
    p90_usd: at(cap.bands.p90),
    days_without_token: days,
    age_years: age === null ? null : Math.round(age * 100) / 100,
  };
}

/** Products that wrap, stake or bridge a token that already trades: no new token of their own to come. */
const DERIVATIVE_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
const DERIVATIVE_NAME = /\b(wrapped|staked|staking)\b|\s(v\d+(\.\d+)?|\d+\.\d+)$/i;
const EXCHANGE_PREFIX = /^(binance|coinbase|bybit|kraken|bitget|okx|bitfinex|gemini)\b/i;

/** Why a pre-token protocol is left off the board, or null when it is a clean launch candidate. */
export function derivativeReason(p: Protocol): string | null {
  if (DERIVATIVE_CATEGORIES.has(p.category ?? '')) return `${p.category} product`;
  if (DERIVATIVE_NAME.test(p.name)) return 'wrapped, staked or versioned';
  if (EXCHANGE_PREFIX.test(p.name)) return 'exchange-branded';
  if (NOT_FARMABLE.has(p.category ?? '')) return `${p.category}: no protocol token to farm`;
  return null;
}

/** Which pre-token protocols the board ranks: every watchlist slug, plus clean farmable pre-token protocols. */
export function boardUniverse(s: Snapshot): Protocol[] {
  const watch = new Set(s.watchlist);
  return s.protocols.filter((p) => watch.has(p.slug) || (!hasToken(p) && p.tvl_usd >= PARAMS.min_tvl_usd && derivativeReason(p) === null));
}

/** Where every snapshot protocol went, in exactly one group. */
export function accountFor(s: Snapshot): { key: string; label: string; slugs: string[] }[] {
  const watch = new Set(s.watchlist);
  const groups: Record<string, string[]> = { watch: [], early: [], priced: [], recorded: [], derivative: [] };
  for (const p of s.protocols) {
    if (watch.has(p.slug)) groups.watch!.push(p.slug);
    else if (p.mcap_usd !== null && p.mcap_usd > 0) groups.priced!.push(p.slug);
    else if (hasToken(p)) groups.recorded!.push(p.slug);
    else if (derivativeReason(p) === null && p.tvl_usd >= PARAMS.min_tvl_usd) groups.early!.push(p.slug);
    else groups.derivative!.push(p.slug);
  }
  return [
    { key: 'watch', label: 'Ranked: watchlist', slugs: groups.watch! },
    { key: 'early', label: 'Ranked: off-list, no token', slugs: groups.early! },
    { key: 'priced', label: 'Token trades: fits the cap model', slugs: groups.priced! },
    { key: 'recorded', label: 'Token recorded, no cap', slugs: groups.recorded! },
    { key: 'derivative', label: 'Left out: wrapped, staked, bridge, exchange or chain', slugs: groups.derivative! },
  ];
}
