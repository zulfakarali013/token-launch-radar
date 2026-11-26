// Token Launch Radar v4: the board's universe and each protocol's valuation.
//
// A protocol that records no token is valued in two parts, both fitted on this snapshot (lib/fit.ts):
//
//   value_if_launch = TVL x exp( launch-value model )   what its token would be worth if it priced
//                                                       like the stand-alone traded tokens of its kind
//   odds            = token-odds model                  the share of protocols like it that record a
//                                                       token: the peers' record, not a forecast
//   implied_value   = value_if_launch x odds
//
// The range around it is the launch-value model's own held-out misses (P25..P75, P10..P90), so a
// printed "50% range" is one that held about half the real caps when they were hidden from the fit.
// Every rule below reads the snapshot's own fields (category, name shape, token record): no protocol,
// exchange or chain is named anywhere in this code, and main.ts checks that.

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

export const MODEL_VERSION = 'fitted-6';

export const PARAMS = {
  min_tvl_usd: 5_000_000, // below this an off-list protocol is accounted for but not ranked
  cap_category_k: 6, // shrinkage of a category's premium, in peers
  odds_category_k: 10, // shrinkage of a category's token share, in peers
  odds_peers_k: 30, // the nearest-peer term: how many peers by size and years listed
};

export function hasToken(p: Protocol): boolean {
  return p.mcap_usd !== null || p.gecko_id !== null || p.symbol !== null;
}

const r4 = (x: number) => Math.round(x * 10_000) / 10_000;

export function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso}T00:00:00Z`);
  const b = Date.parse(`${toIso}T00:00:00Z`);
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

// ---------- what kind of thing a protocol is ----------
export type Kind = 'bridge' | 'staked' | 'exchange' | 'wrapped' | 'chain';
const KIND_BY_CATEGORY: Record<string, Kind> = {
  Bridge: 'bridge',
  'Canonical Bridge': 'bridge',
  'Cross Chain Bridge': 'bridge',
  'Liquid Staking': 'staked',
  'Liquid Restaking': 'staked',
  'Restaked BTC': 'staked',
  CEX: 'exchange',
  Chain: 'chain',
};
const STAKED_NAME = /\b(staked|staking)\b/i;
const WRAPPED_NAME = /\bwrapped\b|\s(v\d+(\.\d+)?|\d+\.\d+)$/i;

/** A form of something else (a bridge, a staked or wrapped form, exchange custody, a chain), or null for a stand-alone protocol. */
export function kindOf(p: Protocol): Kind | null {
  const byCat = KIND_BY_CATEGORY[p.category ?? ''];
  if (byCat) return byCat;
  if (STAKED_NAME.test(p.name)) return 'staked';
  if (WRAPPED_NAME.test(p.name)) return 'wrapped';
  return null;
}

const stem = (name: string) => name.toLowerCase().split(/[\s\-_.]+/)[0] ?? '';

/** Pre-token protocols whose name stem is the stem of a protocol that already records a token: kin of that token. */
export function kinOf(s: Snapshot): Map<string, string> {
  const tokenStems = new Map<string, string>();
  for (const p of [...s.protocols].sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1)))
    if (hasToken(p) && stem(p.name).length >= 4 && !tokenStems.has(stem(p.name))) tokenStems.set(stem(p.name), p.name);
  const kin = new Map<string, string>();
  for (const p of s.protocols) if (!hasToken(p) && tokenStems.has(stem(p.name))) kin.set(p.slug, tokenStems.get(stem(p.name))!);
  return kin;
}

/** The comparables: stand-alone tokens that trade, with a market cap and TVL. */
export function comps(s: Snapshot): Protocol[] {
  return s.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0 && kindOf(p) === null);
}

/** The odds' peers: stand-alone protocols with a listing date (a token or not), kin left out. */
export function oddsPopulation(s: Snapshot): Protocol[] {
  const kin = kinOf(s);
  return s.protocols.filter((p) => p.listed_at !== null && kindOf(p) === null && !kin.has(p.slug));
}

/** Which pre-token protocols the board ranks: every watchlist slug, plus stand-alone pre-token protocols over the floor. */
export function boardUniverse(s: Snapshot): Protocol[] {
  const watch = new Set(s.watchlist);
  const kin = kinOf(s);
  return s.protocols.filter((p) => watch.has(p.slug) || (!hasToken(p) && p.tvl_usd >= PARAMS.min_tvl_usd && kindOf(p) === null && !kin.has(p.slug)));
}

/** Where every snapshot protocol went, in exactly one group, each with its reason. */
export function accountFor(s: Snapshot): { key: string; label: string; why: string; slugs: string[] }[] {
  const watch = new Set(s.watchlist);
  const kin = kinOf(s);
  const G: { key: string; label: string; why: string; test: (p: Protocol) => boolean }[] = [
    { key: 'watch', label: 'Ranked: watchlist', why: 'on the house list: always ranked', test: (p) => watch.has(p.slug) },
    { key: 'early', label: 'Ranked: off-list', why: 'stand-alone, no token, TVL at least $5M', test: (p) => !hasToken(p) && kindOf(p) === null && !kin.has(p.slug) && p.tvl_usd >= PARAMS.min_tvl_usd },
    { key: 'comps', label: 'Token trades: comparables', why: 'a stand-alone token with a market cap: it prices the board', test: (p) => kindOf(p) === null && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0 },
    { key: 'recorded', label: 'Token on record, no cap', why: 'a ticker or CoinGecko id but no market cap: not ranked, not priced from', test: (p) => kindOf(p) === null && hasToken(p) },
    { key: 'bridge', label: 'Bridge', why: 'moves a token that already trades', test: (p) => kindOf(p) === 'bridge' },
    { key: 'staked', label: 'Staked form', why: 'a staked or restaked form of a traded token', test: (p) => kindOf(p) === 'staked' },
    { key: 'exchange', label: 'Exchange custody', why: 'an exchange\'s balances: nothing to farm', test: (p) => kindOf(p) === 'exchange' },
    { key: 'wrapped', label: 'Wrapper or versioned', why: 'a wrapper or a later version of a protocol', test: (p) => kindOf(p) === 'wrapped' },
    { key: 'chain', label: 'Chain', why: 'a chain itself: its token is the gas token', test: (p) => kindOf(p) === 'chain' },
    { key: 'kin', label: 'Kin of a token', why: 'its name stem carries a token already on record', test: (p) => kin.has(p.slug) },
    { key: 'floor', label: 'Under $5M', why: 'stand-alone, no token, under $5M TVL', test: () => true },
  ];
  const out = G.map((g) => ({ key: g.key, label: g.label, why: g.why, slugs: [] as string[] }));
  for (const p of s.protocols) {
    const i = G.findIndex((g) => g.test(p));
    out[i]!.slugs.push(p.slug);
  }
  return out;
}

// ---------- valuation ----------
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
  const logRatio = cap.fit.predict(p);
  const ifLaunch = p.tvl_usd * Math.exp(logRatio);
  const o = odds.predict(p);
  const implied = Math.max(1, Math.round(ifLaunch * o));
  const at = (q: number) => Math.max(1, Math.round(ifLaunch * Math.exp(q) * o));
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
    days_without_token: p.listed_at === null ? null : daysBetween(p.listed_at, asOf),
    age_years: age === null ? null : Math.round(age * 100) / 100,
  };
}
