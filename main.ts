// Token Launch Radar: entry for make.fun's token-radar-01 (Node 22+, standard library only).
//
// Reads /input/snapshot.json (or --input <file|dir>), prices every pre-token protocol against the
// traded peers of its category (lib/model.ts), attaches a costed farm plan (lib/farm.ts), and writes
// /output/board.json, /output/data.js, /output/dashboard/, /output/screenshots/ and /output/dossier.json.
// Outside the grader: mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { MODEL_VERSION, PARAMS, accountFor, boardUniverse, hasToken, valueProtocol, type Protocol, type Snapshot } from './lib/model.ts';
import { baseTerms, categoryTerm, fitCapModel, fitOdds } from './lib/fit.ts';
import { farmPlan, planSummary, stepString } from './lib/farm.ts';
import { VERDICT, verdict } from './lib/verdict.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  return fallback;
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

// 1. Fit both models on the snapshot, each term tested held-out, then value the board's universe.
const terms = baseTerms(snap.as_of);
const [size, growth, age, chains] = terms as [typeof terms[0], typeof terms[0], typeof terms[0], typeof terms[0]];
const traded = snap.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
const catsOf = (ps: Protocol[]) => [...new Set(ps.map((p) => p.category ?? 'Uncategorised'))].sort();
const cap = fitCapModel(traded, [size, categoryTerm(catsOf(traded), PARAMS.cap_category_ridge), growth, age, chains]);
const oddsPop = snap.protocols.filter((p) => p.listed_at !== null);
const odds = fitOdds(oddsPop, [age, size, growth, chains, categoryTerm(catsOf(snap.protocols), PARAMS.odds_category_ridge)]);

const scored = boardUniverse(snap).map((p) => {
  const v = valueProtocol(p, snap.as_of, cap, odds);
  const ps = planSummary(p, v);
  return { p, v, ps, plan: farmPlan(p, v), vd: verdict(p, v, ps) };
});

// Nearest priced peers: the traded protocols closest in size, same category first.
function peersOf(p: Protocol) {
  const dist = (q: Protocol) => Math.abs(Math.log(q.tvl_usd / p.tvl_usd)) + ((q.category ?? '') === (p.category ?? '') ? 0 : 3);
  return [...traded]
    .sort((a, b) => dist(a) - dist(b) || (a.slug < b.slug ? -1 : 1))
    .slice(0, 5)
    .map((q) => {
      const fitted = Math.exp(cap.predictLog(q));
      return { n: q.name, sy: q.symbol, c: q.category, tvl: q.tvl_usd, mc: q.mcap_usd!, ra: Math.round((q.mcap_usd! / q.tvl_usd) * 1000) / 1000, vs: Math.round(((q.mcap_usd! / q.tvl_usd) / fitted) * 100) / 100 };
    });
}
// Highest implied value first; ties broken by TVL then slug so both runs write the same bytes.
scored.sort((a, b) => b.v.implied_value_usd - a.v.implied_value_usd || b.p.tvl_usd - a.p.tvl_usd || (a.p.slug < b.p.slug ? -1 : 1));

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
  model: v,
  farm_steps: plan.map(stepString),
}));

// 2. Self-check against the gate before writing anything.
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
    for (const s of r.farm_steps) if (s.trim().length < 20 || s.trim().length > 600) return `step length ${r.slug}`;
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

// 3. The live set: traded protocols, shown with the market's own value and their mcap/TVL.
const live = snap.protocols
  .filter((p) => p.mcap_usd !== null && p.mcap_usd > 0)
  .sort((a, b) => b.mcap_usd! - a.mcap_usd! || (a.slug < b.slug ? -1 : 1))
  .slice(0, 60)
  .map((p) => ({ slug: p.slug, name: p.name, symbol: p.symbol, category: p.category, chains: p.chains, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd, ratio: Math.round((p.mcap_usd! / p.tvl_usd) * 1000) / 1000, vs: Math.round(((p.mcap_usd! / p.tvl_usd) / Math.exp(cap.predictLog(p))) * 100) / 100 }));

const boardText = `${JSON.stringify({ model_version: MODEL_VERSION, as_of: snap.as_of, rows })}\n`;
const accounting = accountFor(snap).map((g) => ({ key: g.key, label: g.label, n: g.slugs.length }));
const accounted = accounting.reduce((s, g) => s + g.n, 0);
const sizeIdx = cap.terms.findIndex((t) => t.key === 'size');

const data = {
  as_of: snap.as_of,
  source: snap.source,
  floor_usd: snap.floor_usd,
  model_version: MODEL_VERSION,
  cap: {
    steps: cap.steps, kept: cap.terms.map((t) => t.label), n: cap.n, n_wf_test: cap.n_wf_test,
    intercept: Math.round(cap.w[0]! * 1e4) / 1e4, size_slope: sizeIdx >= 0 ? Math.round(cap.w[1 + sizeIdx]! * 1e4) / 1e4 : null,
    at_100m: Math.round(Math.exp(cap.w[0]!) * 1e4) / 1e4, bands: cap.bands, coverage: cap.coverage,
  },
  odds: { steps: odds.steps, kept: odds.terms.map((t) => t.label), base_rate: odds.base_rate, n: odds.n, n_token: odds.n_token },
  verdict_params: VERDICT,
  accounting,
  checks: {
    protocols: snap.protocols.length,
    accounted,
    watchlist: snap.watchlist.length,
    watchlist_ranked: rows.filter((r) => r.on_watchlist).length,
    board_sha256: createHash('sha256').update(boardText).digest('hex').slice(0, 12),
    total_implied_usd: rows.reduce((s, r) => s + r.implied_value_usd, 0),
  },
  counts: { protocols: snap.protocols.length, watchlist: snap.watchlist.length, board: rows.length, traded: traded.length },
  rows: scored.map(({ p, v, ps, plan, vd }, i) => ({
    r: i + 1, s: p.slug, n: p.name, c: p.category, ch: p.chains, tvl: p.tvl_usd, d7: p.change_7d, l: p.listed_at,
    w: watch.has(p.slug) ? 1 : 0, v, fp: plan, ps, vd, pe: peersOf(p),
  })),
  live,
};
if (accounted !== snap.protocols.length) {
  process.stderr.write(`radar: accounting covers ${accounted} of ${snap.protocols.length} protocols\n`);
  process.exit(1);
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
process.stdout.write(`radar: ${rows.length} rows (${rows.filter((r) => r.on_watchlist).length} watchlist), ${live.length} live tokens, cap miss x${cap.steps.at(-1) && Math.min(...cap.steps.map((s) => s.loo))}, odds Brier ${Math.min(...odds.steps.map((s) => s.cv))}\n`);
