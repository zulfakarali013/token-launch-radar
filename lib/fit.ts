// Token Launch Radar v2: fitted, held-out-tested models.
//
// Two models, both fitted on this snapshot alone and both tested on protocols they did not see:
//
//  1. The cap model: log(mcap / TVL) of the traded protocols, regressed (ridge) on candidate terms.
//     Terms enter in a fixed order; a term stays only if it lowers the held-out error in BOTH tests:
//       - leave-one-out (each traded protocol predicted by a fit on all the others), and
//       - walk-forward (fit on the protocols DefiLlama listed first, predict the later-listed ones).
//     The error is the median absolute miss in log space, shown as a multiple (x2.5 = off by 2.5x).
//
//  2. The token odds: a logistic regression of "records a token" over every protocol with a listing
//     date, with the same keep-only-if-both-tests-improve rule (10-fold by slug order, and walk-forward),
//     scored by the Brier score against the base rate.
//
// The ranges come from the cap model's own leave-one-out misses: P25..P75 and P10..P90 of the
// residuals, and the page reports how often real caps fell inside them.

import type { Protocol } from './model.ts';

export type Vec = number[];

const LN = Math.log;
const median = (xs: number[]) => {
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
const r4 = (x: number) => Math.round(x * 10_000) / 10_000;

export function ageYears(p: Protocol, asOf: string): number | null {
  if (!p.listed_at) return null;
  return Math.max(0, (Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${p.listed_at}T00:00:00Z`)) / (365.25 * 86_400_000));
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

/** Penalised logistic regression by Newton steps. */
export function logistic(X: Vec[], y: number[], penalty: number[], iters = 25): number[] {
  const k = penalty.length;
  let w = new Array<number>(k).fill(0);
  for (let it = 0; it < iters; it++) {
    const H = Array.from({ length: k }, () => new Array<number>(k).fill(0));
    const g = new Array<number>(k).fill(0);
    for (let i = 0; i < X.length; i++) {
      const x = X[i]!;
      const z = x.reduce((s, v, j) => s + v * w[j]!, 0);
      const p = 1 / (1 + Math.exp(-z));
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
    if (step.every((s) => Math.abs(s) < 1e-9)) break;
  }
  return w;
}

const dot = (x: Vec, w: number[]) => x.reduce((s, v, j) => s + v * w[j]!, 0);
const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

// ---------- the candidate terms ----------
/** A term turns a protocol into zero or more columns. `ridge` is its penalty. */
export interface Term {
  key: string;
  label: string;
  ridge: number;
  cols: (p: Protocol) => number[];
}

export function categoryTerm(cats: string[], ridgePenalty: number): Term {
  return {
    key: 'category',
    label: `category effect (ridge ${ridgePenalty})`,
    ridge: ridgePenalty,
    cols: (p) => cats.map((c) => ((p.category ?? 'Uncategorised') === c ? 1 : 0)),
  };
}

export function baseTerms(asOf: string): Term[] {
  return [
    { key: 'size', label: 'size curve, ln(TVL / $100M)', ridge: 1, cols: (p) => [LN(p.tvl_usd / 1e8)] },
    { key: 'growth', label: '7-day TVL growth', ridge: 1, cols: (p) => [Math.tanh((p.change_7d ?? 0) / 20)] },
    { key: 'age', label: 'years listed', ridge: 1, cols: (p) => [Math.min(ageYears(p, asOf) ?? 1.5, 6)] },
    { key: 'chains', label: 'chain count, ln', ridge: 1, cols: (p) => [LN(Math.max(1, p.chains.length))] },
  ];
}

const design = (ps: Protocol[], terms: Term[]) => ps.map((p) => [1, ...terms.flatMap((t) => t.cols(p))]);
const penalties = (terms: Term[], ps: Protocol[]) => {
  const one = ps[0]!;
  return [0, ...terms.flatMap((t) => t.cols(one).map(() => t.ridge))];
};

// ---------- cap model ----------
export interface CapStep {
  label: string;
  loo: number; // held-out miss, as a multiple
  wf: number;
  kept: boolean | null; // null = baseline
}

export interface CapModel {
  terms: Term[];
  w: number[];
  steps: CapStep[];
  loo_residuals: number[];
  bands: { p10: number; p25: number; p75: number; p90: number };
  coverage: { in50_loo: number; in80_loo: number; in50_wf: number; in80_wf: number };
  n: number;
  n_wf_test: number;
  predictLog: (p: Protocol) => number;
}

const capY = (p: Protocol) => LN(p.mcap_usd! / p.tvl_usd);

function looResiduals(ps: Protocol[], terms: Term[]): number[] {
  const X = design(ps, terms);
  const y = ps.map(capY);
  const pen = penalties(terms, ps);
  return ps.map((_, i) => {
    const Xi = X.filter((__, j) => j !== i);
    const yi = y.filter((__, j) => j !== i);
    const w = ridge(Xi, yi, pen);
    return y[i]! - dot(X[i]!, w);
  });
}

/** Earlier-listed 60% train, later-listed 40% test (unknown dates sort first, as oldest). */
function walkSplit<T extends Protocol>(ps: T[]): { train: T[]; test: T[] } {
  const s = [...ps].sort((a, b) => (a.listed_at ?? '0000') < (b.listed_at ?? '0000') ? -1 : (a.listed_at ?? '0000') > (b.listed_at ?? '0000') ? 1 : a.slug < b.slug ? -1 : 1);
  const cut = Math.round(s.length * 0.6);
  return { train: s.slice(0, cut), test: s.slice(cut) };
}

function wfResiduals(ps: Protocol[], terms: Term[]): number[] {
  const { train, test } = walkSplit(ps);
  const w = ridge(design(train, terms), train.map(capY), penalties(terms, train));
  return test.map((p) => capY(p) - dot([1, ...terms.flatMap((t) => t.cols(p))], w));
}

const missMultiple = (res: number[]) => r4(Math.exp(median(res.map(Math.abs))));

export function fitCapModel(traded: Protocol[], candidates: Term[]): CapModel {
  const steps: CapStep[] = [];
  let kept: Term[] = [];
  let bestLoo = missMultiple(looResiduals(traded, kept));
  let bestWf = missMultiple(wfResiduals(traded, kept));
  steps.push({ label: 'flat median multiple', loo: bestLoo, wf: bestWf, kept: null });
  for (const t of candidates) {
    const trial = [...kept, t];
    const loo = missMultiple(looResiduals(traded, trial));
    const wf = missMultiple(wfResiduals(traded, trial));
    const keep = loo < bestLoo && wf < bestWf;
    steps.push({ label: `+ ${t.label}`, loo, wf, kept: keep });
    if (keep) {
      kept = trial;
      bestLoo = loo;
      bestWf = wf;
    }
  }
  const w = ridge(design(traded, kept), traded.map(capY), penalties(kept, traded));
  const res = looResiduals(traded, kept);
  const bands = { p10: quantile(res, 0.1), p25: quantile(res, 0.25), p75: quantile(res, 0.75), p90: quantile(res, 0.9) };
  const inside = (rs: number[], lo: number, hi: number) => r4(rs.filter((r) => r >= lo && r <= hi).length / rs.length);
  const wf = wfResiduals(traded, kept);
  return {
    terms: kept,
    w,
    steps,
    loo_residuals: res,
    bands: { p10: r4(bands.p10), p25: r4(bands.p25), p75: r4(bands.p75), p90: r4(bands.p90) },
    coverage: {
      in50_loo: inside(res, bands.p25, bands.p75),
      in80_loo: inside(res, bands.p10, bands.p90),
      in50_wf: inside(wf, bands.p25, bands.p75),
      in80_wf: inside(wf, bands.p10, bands.p90),
    },
    n: traded.length,
    n_wf_test: wf.length,
    predictLog: (p) => dot([1, ...kept.flatMap((t) => t.cols(p))], w),
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
  w: number[];
  steps: OddsStep[];
  base_rate: number;
  n: number;
  n_token: number;
  predict: (p: Protocol) => number;
}

const tokenY = (p: Protocol) => (p.mcap_usd !== null || p.gecko_id !== null || p.symbol !== null ? 1 : 0);
const brier = (ps: number[], ys: number[]) => r4(ps.reduce((s, p, i) => s + (p - ys[i]!) ** 2, 0) / ps.length);

function cvBrier(ps: Protocol[], terms: Term[]): number {
  const preds: number[] = [];
  const ys: number[] = [];
  for (let f = 0; f < 10; f++) {
    const train = ps.filter((_, i) => i % 10 !== f);
    const test = ps.filter((_, i) => i % 10 === f);
    const w = logistic(design(train, terms), train.map(tokenY), penalties(terms, train));
    for (const p of test) {
      preds.push(sigmoid(dot([1, ...terms.flatMap((t) => t.cols(p))], w)));
      ys.push(tokenY(p));
    }
  }
  return brier(preds, ys);
}

function wfBrier(ps: Protocol[], terms: Term[]): number {
  const { train, test } = walkSplit(ps);
  const w = logistic(design(train, terms), train.map(tokenY), penalties(terms, train));
  return brier(test.map((p) => sigmoid(dot([1, ...terms.flatMap((t) => t.cols(p))], w))), test.map(tokenY));
}

export function fitOdds(population: Protocol[], candidates: Term[]): OddsModel {
  const ps = [...population].sort((a, b) => (a.slug < b.slug ? -1 : 1));
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
  const w = logistic(design(ps, kept), ps.map(tokenY), penalties(kept, ps));
  const nTok = ps.filter((p) => tokenY(p) === 1).length;
  return {
    terms: kept,
    w,
    steps,
    base_rate: r4(nTok / ps.length),
    n: ps.length,
    n_token: nTok,
    predict: (p) => sigmoid(dot([1, ...kept.flatMap((t) => t.cols(p))], w)),
  };
}
