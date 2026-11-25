// Token Launch Radar v3: fitted, held-out-tested models.
//
// Two models, both fitted on this snapshot alone and both tested on protocols they did not see.
//
//  1. Launch value. log(mcap / TVL) of the stand-alone traded tokens (lib/model.ts comps(): a token
//     that trades and is not a bridge, staked, wrapped, exchange or versioned form of another one),
//     regressed (ridge, and again with a Huber loss) on candidate terms that enter in a fixed order. A term stays only if it lowers
//     the held-out miss in BOTH blind tests:
//       - leave-one-out: each traded token priced by a fit on all the others;
//       - walk-forward: fit on the earliest-listed 60%, price the newer 40% (the past grading the future).
//     A third test, 10-fold, is reported beside them and never used to pick. The miss is the median
//     absolute miss in log space, printed as a multiple (x2.5 = off by 2.5 times either way).
//
//  2. Token odds. A logistic regression of "records a token" over every stand-alone protocol with a
//     listing date, scored by the Brier score against the base rate, with the same rule (10-fold and
//     walk-forward must both improve).
//
// A term that is itself learned from the data (a category's premium, a category's token share) is
// learned inside each training split only, so no protocol ever helps price itself. The ranges come
// from the launch-value model's own leave-one-out misses, and the page prints how often real caps fell
// inside them. A seeded bootstrap (200 refits) gives each coefficient a standard error and each
// board row the range of ranks it takes when the data are redrawn.

import type { Protocol } from './model.ts';

export type Vec = number[];

const LN = Math.log;
export const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length === 0 ? NaN : s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
export const quantile = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  if (s.length === 0) return NaN;
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo]! + (s[hi]! - s[lo]!) * (pos - lo);
};
export const r4 = (x: number) => Math.round(x * 10_000) / 10_000;
const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));
const logit = (p: number) => LN(p / (1 - p));
const dot = (x: Vec, w: number[]) => x.reduce((s, v, j) => s + v * w[j]!, 0);

export function ageYears(p: Protocol, asOf: string): number | null {
  if (!p.listed_at) return null;
  return Math.max(0, (Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${p.listed_at}T00:00:00Z`)) / (365.25 * 86_400_000));
}

/** A small seeded generator (mulberry32), so every bootstrap draw is the same on every run. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

// ---------- linear algebra (small, dense, deterministic) ----------
function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[p]![c]!)) p = r;
    [M[c], M[p]] = [M[p]!, M[c]!];
    const d = M[c]![c]!;
    if (Math.abs(d) < 1e-12) continue;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r]![c]! / d;
      if (f !== 0) for (let k = c; k <= n; k++) M[r]![k]! -= f * M[c]![k]!;
    }
  }
  return M.map((row, i) => (Math.abs(row[i]!) < 1e-12 ? 0 : row[n]! / row[i]!));
}

/** Ridge least squares; penalty[j] per column (0 for the intercept). */
export function ridge(X: Vec[], y: number[], penalty: number[]): number[] {
  const k = penalty.length;
  const A = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const b = new Array<number>(k).fill(0);
  for (let i = 0; i < X.length; i++) {
    const x = X[i]!;
    for (let a = 0; a < k; a++) {
      b[a]! += x[a]! * y[i]!;
      for (let c = 0; c < k; c++) A[a]![c]! += x[a]! * x[c]!;
    }
  }
  for (let a = 0; a < k; a++) A[a]![a]! += penalty[a]!;
  return solve(A, b);
}

/** Huber regression by reweighted ridge: a miss within delta (log units) counts squared, a bigger
 * one only linearly, so a handful of wild caps cannot drag the line. 40 reweighting rounds. */
export function huber(X: Vec[], y: number[], penalty: number[], delta = HUBER_DELTA): number[] {
  let w = ridge(X, y, penalty);
  for (let it = 0; it < 40; it++) {
    const wt = X.map((x, i) => {
      const r = Math.abs(y[i]! - dot(x, w));
      return r <= delta ? 1 : delta / r;
    });
    w = ridge(X.map((x, i) => x.map((v) => v * Math.sqrt(wt[i]!))), y.map((v, i) => v * Math.sqrt(wt[i]!)), penalty);
  }
  return w;
}
/** 1.5 in log units: a miss past about x4.5 counts linearly. Set once, before the term search. */
export const HUBER_DELTA = 1.5;
export type CapLoss = 'ridge' | 'huber';

/** Penalised logistic regression by Newton steps. */
export function logistic(X: Vec[], y: number[], penalty: number[], iters = 30): number[] {
  const k = penalty.length;
  let w = new Array<number>(k).fill(0);
  for (let it = 0; it < iters; it++) {
    const H = Array.from({ length: k }, () => new Array<number>(k).fill(0));
    const g = new Array<number>(k).fill(0);
    for (let i = 0; i < X.length; i++) {
      const x = X[i]!;
      const p = sigmoid(dot(x, w));
      const s = Math.max(p * (1 - p), 1e-6);
      for (let a = 0; a < k; a++) {
        g[a]! += (y[i]! - p) * x[a]!;
        for (let c = 0; c < k; c++) H[a]![c]! += s * x[a]! * x[c]!;
      }
    }
    for (let a = 0; a < k; a++) {
      g[a]! -= penalty[a]! * w[a]!;
      H[a]![a]! += penalty[a]!;
    }
    const step = solve(H, g);
    w = w.map((v, j) => v + step[j]!);
    if (step.every((s) => Math.abs(s) < 1e-10)) break;
  }
  return w;
}

// ---------- terms ----------
/** A fitted term: its column for any protocol, and what it learned (for the page to recompute it). */
export interface Enc {
  col: (p: Protocol) => number;
  table?: Record<string, number>;
}
/** A candidate term. `learn` sees only the training split (and its targets). */
export interface Term {
  key: string;
  label: string;
  ridge: number;
  learn: (train: Protocol[], y: number[]) => Enc;
}

const catOf = (p: Protocol) => p.category ?? 'Uncategorised';
const fixed = (col: (p: Protocol) => number): Term['learn'] => () => ({ col });

/** The simple terms; each is a fixed function of the protocol's own record (the page repeats them). */
export function recordTerms(asOf: string) {
  const years = (p: Protocol) => ageYears(p, asOf) ?? 1.5;
  return {
    size: { key: 'size', label: 'size curve, ln TVL', ridge: 0.5, learn: fixed((p) => LN(p.tvl_usd / 1e8)) } as Term,
    growth: { key: 'growth', label: '7-day TVL growth', ridge: 1, learn: fixed((p) => Math.tanh((p.change_7d ?? 0) / 20)) } as Term,
    age: { key: 'age', label: 'years listed, ln', ridge: 0.5, learn: fixed((p) => LN(1 + years(p))) } as Term,
    chains: { key: 'chains', label: 'chain count, ln', ridge: 1, learn: fixed((p) => LN(Math.max(1, p.chains.length))) } as Term,
  };
}

/** A category's premium on the curve: the mean of y in that category, shrunk toward 0 by k peers. */
export function categoryPremium(k: number): Term {
  return {
    key: 'catprem',
    label: `category premium (shrunk ${k})`,
    ridge: 0.5,
    learn: (train, y) => {
      const mu = y.reduce((s, v) => s + v, 0) / y.length;
      const sum: Record<string, number> = {};
      const n: Record<string, number> = {};
      train.forEach((p, i) => {
        sum[catOf(p)] = (sum[catOf(p)] ?? 0) + y[i]! - mu;
        n[catOf(p)] = (n[catOf(p)] ?? 0) + 1;
      });
      const table: Record<string, number> = {};
      for (const c of Object.keys(sum).sort()) table[c] = r4(sum[c]! / (n[c]! + k));
      return { col: (p) => table[catOf(p)] ?? 0, table };
    },
  };
}

/** A category's token share: the share of its peers that record a token, shrunk toward the base rate. */
export function categoryShare(k: number): Term {
  return {
    key: 'catshare',
    label: `category token share (shrunk ${k})`,
    ridge: 0.5,
    learn: (train, y) => {
      const base = y.reduce((s, v) => s + v, 0) / y.length;
      const tok: Record<string, number> = {};
      const n: Record<string, number> = {};
      train.forEach((p, i) => {
        tok[catOf(p)] = (tok[catOf(p)] ?? 0) + y[i]!;
        n[catOf(p)] = (n[catOf(p)] ?? 0) + 1;
      });
      const table: Record<string, number> = {};
      for (const c of Object.keys(n).sort()) table[c] = r4(logit((tok[c]! + k * base) / (n[c]! + k)) - logit(base));
      return { col: (p) => table[catOf(p)] ?? 0, table };
    },
  };
}

// ---------- one fitted model ----------
export interface Fitted {
  encs: Enc[];
  w: number[];
  predict: (p: Protocol) => number; // the linear score: log(cap/TVL), or the odds' logit
}

function fitOn(train: Protocol[], y: number[], terms: Term[], kind: 'ridge' | 'huber' | 'logistic'): Fitted {
  const encs = terms.map((t) => t.learn(train, y));
  const X = train.map((p) => [1, ...encs.map((e) => e.col(p))]);
  const pen = [0, ...terms.map((t) => t.ridge)];
  const w = kind === 'ridge' ? ridge(X, y, pen) : kind === 'huber' ? huber(X, y, pen) : logistic(X, y, pen);
  return { encs, w, predict: (p) => dot([1, ...encs.map((e) => e.col(p))], w) };
}

const bySlug = <T extends Protocol>(ps: T[]) => [...ps].sort((a, b) => (a.slug < b.slug ? -1 : 1));
/** Earliest-listed 60% train, newer 40% test (unknown dates sort first, as oldest). */
export function walkSplit<T extends Protocol>(ps: T[], share = 0.6): { train: T[]; test: T[]; cutDate: string } {
  const key = (p: Protocol) => p.listed_at ?? '0000';
  const s = [...ps].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : a.slug < b.slug ? -1 : 1));
  const cut = Math.round(s.length * share);
  return { train: s.slice(0, cut), test: s.slice(cut), cutDate: s[cut]?.listed_at ?? '' };
}

// ---------- launch value ----------
export interface CapStep {
  label: string;
  loo: number;
  wf: number;
  k10: number;
  kept: boolean | null; // null = baseline
}
export interface CapModel {
  loss: CapLoss;
  terms: Term[];
  fit: Fitted;
  steps: CapStep[];
  loo_pred: Map<string, number>; // each comparable's blind log(cap/TVL)
  bands: { p10: number; p25: number; p75: number; p90: number };
  coverage: { in50_loo: number; in80_loo: number; in3x_loo: number; in50_wf: number; in80_wf: number; in3x_wf: number };
  n: number;
  n_wf_train: number;
  n_wf_test: number;
  wf_cut: string;
}

const capY = (p: Protocol) => LN(p.mcap_usd! / p.tvl_usd);
const missMultiple = (res: number[]) => r4(Math.exp(median(res.map(Math.abs))));

function capLoo(ps: Protocol[], terms: Term[], loss: CapLoss): number[] {
  return ps.map((p, i) => {
    const tr = ps.filter((_, j) => j !== i);
    return capY(p) - fitOn(tr, tr.map(capY), terms, loss).predict(p);
  });
}
function capWf(ps: Protocol[], terms: Term[], loss: CapLoss): number[] {
  const { train, test } = walkSplit(ps);
  const f = fitOn(train, train.map(capY), terms, loss);
  return test.map((p) => capY(p) - f.predict(p));
}
function capK10(ps: Protocol[], terms: Term[], loss: CapLoss): number[] {
  const res: number[] = [];
  for (let f = 0; f < 10; f++) {
    const tr = ps.filter((_, i) => i % 10 !== f);
    const fit = fitOn(tr, tr.map(capY), terms, loss);
    for (const p of ps.filter((_, i) => i % 10 === f)) res.push(capY(p) - fit.predict(p));
  }
  return res;
}

export function fitCapModel(comps: Protocol[], candidates: Term[], loss: CapLoss = 'ridge'): CapModel {
  const ps = bySlug(comps);
  const steps: CapStep[] = [];
  let kept: Term[] = [];
  let bestLoo = missMultiple(capLoo(ps, kept, loss));
  let bestWf = missMultiple(capWf(ps, kept, loss));
  steps.push({ label: 'flat median multiple', loo: bestLoo, wf: bestWf, k10: missMultiple(capK10(ps, kept, loss)), kept: null });
  for (const t of candidates) {
    const trial = [...kept, t];
    const loo = missMultiple(capLoo(ps, trial, loss));
    const wf = missMultiple(capWf(ps, trial, loss));
    const keep = loo < bestLoo && wf < bestWf;
    steps.push({ label: `+ ${t.label}`, loo, wf, k10: missMultiple(capK10(ps, trial, loss)), kept: keep });
    if (keep) {
      kept = trial;
      bestLoo = loo;
      bestWf = wf;
    }
  }
  const fit = fitOn(ps, ps.map(capY), kept, loss);
  const res = capLoo(ps, kept, loss);
  const wf = capWf(ps, kept, loss);
  const q = (x: number) => r4(quantile(res, x));
  const bands = { p10: q(0.1), p25: q(0.25), p75: q(0.75), p90: q(0.9) };
  const share = (rs: number[], lo: number, hi: number) => r4(rs.filter((r) => r >= lo && r <= hi).length / rs.length);
  const split = walkSplit(ps);
  return {
    loss,
    terms: kept,
    fit,
    steps,
    loo_pred: new Map(ps.map((p, i) => [p.slug, capY(p) - res[i]!])),
    bands,
    coverage: {
      in50_loo: share(res, bands.p25, bands.p75),
      in80_loo: share(res, bands.p10, bands.p90),
      in3x_loo: share(res, -LN(3), LN(3)),
      in50_wf: share(wf, bands.p25, bands.p75),
      in80_wf: share(wf, bands.p10, bands.p90),
      in3x_wf: share(wf, -LN(3), LN(3)),
    },
    n: ps.length,
    n_wf_train: split.train.length,
    n_wf_test: split.test.length,
    wf_cut: split.cutDate,
  };
}

// ---------- token odds ----------
export interface OddsStep {
  label: string;
  cv: number; // Brier, 10-fold
  wf: number; // Brier, walk-forward
  kept: boolean | null;
}
export interface OddsModel {
  terms: Term[];
  fit: Fitted;
  steps: OddsStep[];
  base_rate: number;
  n: number;
  n_token: number;
  predict: (p: Protocol) => number;
}

export const tokenY = (p: Protocol) => (p.mcap_usd !== null || p.gecko_id !== null || p.symbol !== null ? 1 : 0);
const brier = (ps: number[], ys: number[]) => r4(ps.reduce((s, p, i) => s + (p - ys[i]!) ** 2, 0) / ps.length);

function cvBrier(ps: Protocol[], terms: Term[]): number {
  const preds: number[] = [];
  const ys: number[] = [];
  for (let f = 0; f < 10; f++) {
    const tr = ps.filter((_, i) => i % 10 !== f);
    const fit = fitOn(tr, tr.map(tokenY), terms, 'logistic');
    for (const p of ps.filter((_, i) => i % 10 === f)) {
      preds.push(sigmoid(fit.predict(p)));
      ys.push(tokenY(p));
    }
  }
  return brier(preds, ys);
}
function wfBrier(ps: Protocol[], terms: Term[]): number {
  const { train, test } = walkSplit(ps);
  const fit = fitOn(train, train.map(tokenY), terms, 'logistic');
  return brier(test.map((p) => sigmoid(fit.predict(p))), test.map(tokenY));
}

export function fitOdds(population: Protocol[], candidates: Term[]): OddsModel {
  const ps = bySlug(population);
  const steps: OddsStep[] = [];
  let kept: Term[] = [];
  let bestCv = cvBrier(ps, kept);
  let bestWf = wfBrier(ps, kept);
  steps.push({ label: 'base rate', cv: bestCv, wf: bestWf, kept: null });
  for (const t of candidates) {
    const trial = [...kept, t];
    const cv = cvBrier(ps, trial);
    const wf = wfBrier(ps, trial);
    const keep = cv < bestCv && wf < bestWf;
    steps.push({ label: `+ ${t.label}`, cv, wf, kept: keep });
    if (keep) {
      kept = trial;
      bestCv = cv;
      bestWf = wf;
    }
  }
  const fit = fitOn(ps, ps.map(tokenY), kept, 'logistic');
  const nTok = ps.filter((p) => tokenY(p) === 1).length;
  return { terms: kept, fit, steps, base_rate: r4(nTok / ps.length), n: ps.length, n_token: nTok, predict: (p) => sigmoid(fit.predict(p)) };
}

// ---------- bootstrap ----------
export interface Boot {
  cap_se: number[]; // standard error of each launch-value coefficient (intercept first)
  odds_se: number[];
  rank_lo: number[]; // per board row, in the order given: 5th and 95th percentile rank
  rank_hi: number[];
}

/** Refit both models on resampled data B times; rank the board each time by implied value. */
export function bootstrap(comps: Protocol[], pop: Protocol[], cap: CapModel, odds: OddsModel, board: Protocol[], B = 200, seed = 20261114): Boot {
  const rand = rng(seed);
  const C = bySlug(comps);
  const P = bySlug(pop);
  const draw = <T>(xs: T[]) => xs.map(() => xs[Math.floor(rand() * xs.length)]!);
  const capW: number[][] = [];
  const oddsW: number[][] = [];
  const ranks: number[][] = board.map(() => []);
  for (let b = 0; b < B; b++) {
    const c = draw(C);
    const o = draw(P);
    const fc = fitOn(c, c.map(capY), cap.terms, cap.loss);
    const fo = fitOn(o, o.map(tokenY), odds.terms, 'logistic');
    capW.push(fc.w);
    oddsW.push(fo.w);
    const v = board.map((p) => p.tvl_usd * Math.exp(fc.predict(p)) * sigmoid(fo.predict(p)));
    const order = v.map((x, i) => [x, i] as const).sort((a, b2) => b2[0] - a[0] || a[1] - b2[1]);
    order.forEach(([, i], r) => ranks[i]!.push(r + 1));
  }
  const se = (ws: number[][]) =>
    ws[0]!.map((_, j) => {
      const xs = ws.map((w) => w[j]!);
      const m = xs.reduce((s, x) => s + x, 0) / xs.length;
      return r4(Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1)));
    });
  return {
    cap_se: se(capW),
    odds_se: se(oddsW),
    rank_lo: ranks.map((r) => Math.round(quantile(r, 0.05))),
    rank_hi: ranks.map((r) => Math.round(quantile(r, 0.95))),
  };
}
