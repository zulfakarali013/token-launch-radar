// Token Launch Radar v6: entry for make.fun's token-radar-01 (Node 22+, standard library only).
//
// Reads /input/snapshot.json (or --input <file|dir>), fits the launch-value and token-odds models on
// it and tests every term held-out (lib/fit.ts), values every pre-token protocol (lib/model.ts),
// prices a timed, costed farm plan for each (lib/farm.ts, lib/verdict.ts), and writes
// /output/board.json, /output/data.js, /output/dashboard/, /output/screenshots/ and /output/dossier.json.
// Outside the grader: mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { MODEL_VERSION, PARAMS, accountFor, boardUniverse, comps, hasToken, kinOf, oddsPopulation, valueProtocol, type Protocol, type Snapshot } from './lib/model.ts';
import { HUBER_DELTA, bootstrap, categoryPremium, categoryShare, fitCapModel, fitOdds, nearestPeers, r4, recordTerms } from './lib/fit.ts';
import { PLAN, farmPlan, planSummary, stepString } from './lib/farm.ts';
import { VERDICT, netFor, verdict } from './lib/verdict.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 && at + 1 < process.argv.length ? process.argv[at + 1]! : fallback;
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`radar: no snapshot at ${inputFile}\n`);
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
const snap = JSON.parse(readFileSync(inputFile, 'utf8')) as Snapshot;
const watch = new Set(snap.watchlist);
const kin = kinOf(snap);

// 1. Fit both models on the snapshot, every term tested on protocols it never saw.
const T = recordTerms(snap.as_of);
const C = comps(snap);
const POP = oddsPopulation(snap);
const CAP_TERMS = [T.size, categoryPremium(PARAMS.cap_category_k), T.growth, T.age, T.chains, T.size2, T.agesize, T.multi, T.swing, T.eth, T.young];
// The same term search run twice: least squares, then a Huber loss (a wild cap counts linearly).
// The loss used is the one whose final model has the smaller typical miss across BOTH blind tests
// (geometric mean of the leave-one-out and walk-forward miss multiples).
const capLs = fitCapModel(C, CAP_TERMS, 'ridge');
const capHu = fitCapModel(C, CAP_TERMS, 'huber');
const last = (m: typeof capLs) => m.steps.filter((x) => x.kept !== false).at(-1)!;
const both = (m: typeof capLs) => Math.sqrt(last(m).loo * last(m).wf);
const huberWins = both(capHu) < both(capLs);
const cap = huberWins ? capHu : capLs;
const capAlt = huberWins ? capLs : capHu;
const odds = fitOdds(POP, [T.age, categoryShare(PARAMS.odds_category_k), T.size, T.growth, T.chains, T.age2, T.agesize, T.multi, T.swing, T.eth, T.size2, T.young, T.sizeg, nearestPeers(PARAMS.odds_peers_k, snap.as_of)]);

// 2. Value the board, plan and price a farm for every row, rank by implied value.
const scored = boardUniverse(snap).map((p) => {
  const v = valueProtocol(p, snap.as_of, cap, odds);
  const ps = planSummary(p, v);
  const vd = verdict(p, v, ps);
  return { p, v, ps, vd, plan: farmPlan(p, v, ps, vd) };
});
scored.sort((a, b) => b.v.implied_value_usd - a.v.implied_value_usd || b.p.tvl_usd - a.p.tvl_usd || (a.p.slug < b.p.slug ? -1 : 1));
const boot = bootstrap(C, POP, cap, odds, scored.map((x) => x.p));

// What moves the value: the same protocol with one field of its record changed.
function sensitivity(p: Protocol) {
  const base = valueProtocol(p, snap.as_of, cap, odds).implied_value_usd;
  const older = p.listed_at ? new Date(Date.parse(`${p.listed_at}T00:00:00Z`) - 182 * 86_400_000).toISOString().slice(0, 10) : null;
  const cases: [string, Protocol][] = [
    ['TVL 30% lower', { ...p, tvl_usd: p.tvl_usd * 0.7 }],
    ['TVL doubles', { ...p, tvl_usd: p.tvl_usd * 2 }],
    ['7-day change 0%', { ...p, change_7d: 0 }],
    ['six more months, still no token', { ...p, listed_at: older }],
  ];
  return cases.map(([k, q]) => {
    const v = valueProtocol(q, snap.as_of, cap, odds);
    return { k, ifl: v.value_if_launch_usd, o: v.odds, iv: v.implied_value_usd, x: r4(v.implied_value_usd / base) };
  });
}

// Nearest comparables: same category first, then closest in size; each with its blind (left-out) price.
function peersOf(p: Protocol) {
  const dist = (q: Protocol) => Math.abs(Math.log(q.tvl_usd / p.tvl_usd)) + ((q.category ?? '') === (p.category ?? '') ? 0 : 2);
  return [...C]
    .sort((a, b) => dist(a) - dist(b) || (a.slug < b.slug ? -1 : 1))
    .slice(0, 5)
    .map((q) => {
      const blind = Math.round(q.tvl_usd * Math.exp(cap.loo_pred.get(q.slug)!));
      return { n: q.name, sy: q.symbol, c: q.category, tvl: q.tvl_usd, mc: q.mcap_usd!, b: blind, m: r4(q.mcap_usd! / blind) };
    });
}

const rows = scored.map(({ p, v, plan }, i) => ({
  rank: i + 1,
  slug: p.slug,
  name: p.name,
  implied_value_usd: v.implied_value_usd,
  token_status: hasToken(p) ? 'token-recorded' : 'pre-token',
  on_watchlist: watch.has(p.slug),
  category: p.category,
  chains: p.chains,
  tvl_usd: p.tvl_usd,
  change_7d: p.change_7d,
  listed_at: p.listed_at,
  rank_range: [Math.min(boot.rank_lo[i]!, i + 1), Math.max(boot.rank_hi[i]!, i + 1)],
  model: v,
  farm_steps: plan.map(stepString),
}));

// 3. Self-check against the gate before writing anything.
function gateIssue(): string | null {
  if (rows.length < 100 || rows.length > 4000) return `board holds ${rows.length} rows`;
  const slugs = new Set(snap.protocols.map((p) => p.slug));
  const seen = new Set<string>();
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    if (!slugs.has(r.slug) || seen.has(r.slug)) return `bad slug ${r.slug}`;
    seen.add(r.slug);
    if (!Number.isInteger(r.implied_value_usd) || r.implied_value_usd < 1 || r.implied_value_usd > 1e14) return `bad value ${r.slug}`;
    if (i > 0 && r.implied_value_usd > rows[i - 1]!.implied_value_usd) return `value rises at rank ${r.rank}`;
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `steps count ${r.slug}`;
    for (const s of r.farm_steps) if (s.trim().length < 20 || s.trim().length > 600) return `step length ${r.slug}: ${s.length}`;
  }
  for (const w of snap.watchlist) if (!seen.has(w)) return `watchlist slug missing: ${w}`;
  if (new Set(rows.map((r) => r.implied_value_usd)).size < 2) return 'all values equal';
  return null;
}
const issue = gateIssue();
if (issue) {
  process.stderr.write(`radar: gate would refuse the board: ${issue}\n`);
  process.exit(1);
}

// 4. Integrity: every protocol in one group, and no protocol named anywhere in this program's code.
const accounting = accountFor(snap).map((g) => ({ key: g.key, label: g.label, why: g.why, n: g.slugs.length }));
const accounted = accounting.reduce((s, g) => s + g.n, 0);
if (accounted !== snap.protocols.length) {
  process.stderr.write(`radar: accounting covers ${accounted} of ${snap.protocols.length} protocols\n`);
  process.exit(1);
}
const codeFiles = ['main.ts', ...readdirSync(join(here, 'lib')).map((f) => `lib/${f}`), ...readdirSync(join(here, 'dashboard')).map((f) => `dashboard/${f}`)].sort();
const code = codeFiles.map((f) => readFileSync(join(here, f), 'utf8')).join('\n');
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// A chain's own entry (category Chain) shares its name with the chain, which the gas table must name.
const named = snap.protocols.filter((p) => p.category !== 'Chain' && p.name.length >= 4 && new RegExp(`(^|[^A-Za-z0-9])${esc(p.name)}([^A-Za-z0-9]|$)`).test(code)).map((p) => p.name);

const boardText = `${JSON.stringify({ model_version: MODEL_VERSION, as_of: snap.as_of, rows })}\n`;
const capKeys = cap.terms.map((t) => t.key);
const oddsKeys = odds.terms.map((t) => t.key);
const tableOf = (encs: { table?: Record<string, number> }[]) => encs.find((e) => e.table)?.table ?? null;
const live = [...C]
  .sort((a, b) => b.mcap_usd! - a.mcap_usd! || (a.slug < b.slug ? -1 : 1))
  .map((q) => ({ n: q.name, sy: q.symbol, c: q.category, l: q.listed_at, tvl: q.tvl_usd, mc: q.mcap_usd!, b: Math.round(q.tvl_usd * Math.exp(cap.loo_pred.get(q.slug)!)) }));

const data = {
  as_of: snap.as_of,
  source: snap.source,
  floor_usd: snap.floor_usd,
  model_version: MODEL_VERSION,
  cap: {
    loss: cap.loss, huber_delta: HUBER_DELTA, alt: { loss: capAlt.loss, steps: capAlt.steps, kept: capAlt.terms.map((t) => t.label) },
    steps: cap.steps, keys: capKeys, kept: cap.terms.map((t) => t.label), w: cap.fit.w, se: boot.cap_se, table: tableOf(cap.fit.encs),
    bands: cap.bands, coverage: cap.coverage, n: cap.n, n_wf_train: cap.n_wf_train, n_wf_test: cap.n_wf_test, wf_cut: cap.wf_cut,
  },
  odds: { steps: odds.steps, keys: oddsKeys, kept: odds.terms.map((t) => t.label), w: odds.fit.w, se: boot.odds_se, table: tableOf(odds.fit.encs), peers: odds.fit.encs.find((e) => e.peers)?.peers ?? null, peers_k: PARAMS.odds_peers_k, peers_base: odds.fit.encs.find((e) => e.peers)?.base ?? null, base_rate: odds.base_rate, n: odds.n, n_token: odds.n_token },
  verdict: VERDICT,
  plan: PLAN,
  accounting,
  checks: {
    protocols: snap.protocols.length,
    accounted,
    watchlist: snap.watchlist.length,
    watchlist_ranked: rows.filter((r) => r.on_watchlist).length,
    board_sha256: createHash('sha256').update(boardText).digest('hex').slice(0, 12),
    total_implied_usd: rows.reduce((s, r) => s + r.implied_value_usd, 0),
    names_in_code: named.length,
    code_files: codeFiles.length,
    bootstrap: 200,
  },
  rows: scored.map(({ p, v, ps, vd, plan }, i) => ({
    r: i + 1, s: p.slug, n: p.name, c: p.category, ch: p.chains, tvl: p.tvl_usd, d7: p.change_7d, l: p.listed_at,
    w: watch.has(p.slug) ? 1 : 0, k: kin.get(p.slug) ?? null, rk: rows[i]!.rank_range, v, ps, vd, fp: plan, pe: peersOf(p), sv: sensitivity(p),
  })),
  live,
};

// The plan's own verdict must agree with the verdict formula at the plan's settings.
for (const x of scored) {
  const again = netFor(x.p, x.v, x.ps, x.ps.deposit_usd, VERDICT.drop_share, x.ps.weeks);
  if (again.net_usd !== x.vd.net_usd) {
    process.stderr.write(`radar: verdict disagrees for ${x.p.slug}\n`);
    process.exit(1);
  }
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), boardText);
writeFileSync(join(out, 'data.js'), `window.RADAR = ${JSON.stringify(data)};\n`);

function copyDir(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const names: string[] = [];
  for (const name of readdirSync(from).sort()) {
    if (name.startsWith('.') || !statSync(join(from, name)).isFile()) continue;
    copyFileSync(join(from, name), join(to, name));
    names.push(name);
  }
  return names;
}
copyDir(join(here, 'dashboard'), join(out, 'dashboard'));

// Screenshots are kept in the repository as base64 text (<name>.b64) so the repository stays plain
// text; each is decoded back to its image in /output/screenshots. A plain image file is copied as is.
function writeShots(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const names: string[] = [];
  for (const name of readdirSync(from).sort()) {
    const path = join(from, name);
    if (name.startsWith('.') || !statSync(path).isFile()) continue;
    if (name.endsWith('.b64')) {
      const image = name.slice(0, -4);
      writeFileSync(join(to, image), Buffer.from(readFileSync(path, 'utf8').replace(/\s+/g, ''), 'base64'));
      names.push(image);
    } else {
      copyFileSync(path, join(to, name));
      names.push(name);
    }
  }
  return names;
}
const shots = writeShots(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3) {
  process.stderr.write(`radar: screenshots/ holds ${shots.length} images, 3 needed\n`);
  process.exit(1);
}

writeFileSync(join(out, 'dossier.json'), buildDossier(out, { text_max_bytes: 65_536, screenshots: { max: 4, max_bytes: 524_288 }, dashboard: { max_files: 400, max_bytes: 4_194_304 } }));
const calls = (c: string) => scored.filter((x) => x.vd.call === c).length;
process.stdout.write(
  `radar: ${rows.length} rows (${rows.filter((r) => r.on_watchlist).length} watchlist); launch value ${cap.loss} kept [${capKeys}] miss loo x${last(cap).loo} wf x${last(cap).wf} (other loss: loo x${last(capAlt).loo} wf x${last(capAlt).wf}); odds kept [${oddsKeys}]; ` +
    `FARM ${calls('FARM')} MARGINAL ${calls('MARGINAL')} SKIP ${calls('SKIP')}; names in code ${named.length}${named.length ? ` (${named.join(', ')})` : ''}\n`,
);
