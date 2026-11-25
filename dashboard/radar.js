// Token Launch Radar page. Reads window.RADAR (written by main.ts into data.js) and renders the ranked
// pre-token board with its evidence strip, a per-protocol detail (how the figure is made, the farm
// verdict and its grid, the nearest priced peers, the plan), the held-out evidence and the live tokens.
// Every figure shown is read from data.js; nothing is fetched. State lives in the URL hash.
(function () {
  'use strict';
  const D = window.RADAR;
  const $ = (s, el) => (el || document).querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  function money(x) {
    if (x == null) return '-';
    const a = Math.abs(x), s = x < 0 ? '-' : '';
    if (a >= 1e9) return s + '$' + (a / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return s + '$' + (a / 1e6).toFixed(1) + 'M';
    if (a >= 1e4) return s + '$' + (a / 1e3).toFixed(0) + 'K';
    if (a >= 10) return s + '$' + Math.round(a).toLocaleString('en-US');
    return s + '$' + a.toFixed(2);
  }
  const pct = (x, d = 1) => (x == null ? '-' : (x > 0 ? '+' : '') + x.toFixed(d) + '%');
  const cls = (x) => (x == null ? '' : x >= 0 ? 'up' : 'dn');
  const xm = (x) => '\u00d7' + Number(x).toFixed(2);
  const share = (x) => Math.round(x * 100) + '%';
  const age = (r) => (r.v.days_without_token == null ? 'n/a' : r.v.days_without_token >= 365 ? (r.v.days_without_token / 365.25).toFixed(1) + ' yr' : r.v.days_without_token + ' d');
  const P = D.verdict_params;
  const CALLS = { GO: 'Farm', WATCH: 'Marginal', PASS: 'Skip' };

  for (const r of D.rows) { r.iv = r.v.implied_value_usd; r.odds = r.v.odds; r.ifl = r.v.value_if_launch_usd; r.age = r.v.days_without_token; r.nph = r.vd.net_per_hour_usd; }

  const state = { q: '', cat: '', chain: '', tvl: 0, wl: false, early: false, up: false, call: '', sort: 'r', dir: 1, sel: null, tab: 'board', full: false };
  function readHash() {
    const h = new URLSearchParams(location.hash.slice(1));
    for (const k of ['q', 'cat', 'chain', 'tab', 'call']) if (h.has(k)) state[k] = h.get(k);
    if (h.has('tvl')) state.tvl = Number(h.get('tvl')) || 0;
    for (const k of ['wl', 'early', 'up', 'full']) state[k] = h.get(k) === '1';
    if (h.has('sort')) state.sort = h.get('sort');
    if (h.has('dir')) state.dir = Number(h.get('dir')) || 1;
    state.sel = h.get('p');
  }
  function writeHash() {
    const h = new URLSearchParams();
    if (state.tab !== 'board') h.set('tab', state.tab);
    for (const k of ['q', 'cat', 'chain', 'call']) if (state[k]) h.set(k, state[k]);
    if (state.tvl) h.set('tvl', state.tvl);
    for (const k of ['wl', 'early', 'up', 'full']) if (state[k]) h.set(k, '1');
    if (state.sort !== 'r' || state.dir !== 1) { h.set('sort', state.sort); h.set('dir', state.dir); }
    if (state.sel) h.set('p', state.sel);
    history.replaceState(null, '', '#' + h.toString());
  }

  const capBase = D.cap.steps[0], capBest = D.cap.steps.filter((s) => s.kept !== false).at(-1);
  const oddsBase = D.odds.steps[0], oddsBest = D.odds.steps.filter((s) => s.kept !== false).at(-1);
  const counts = { GO: 0, WATCH: 0, PASS: 0 };
  D.rows.forEach((r) => counts[r.vd.call]++);

  function header() {
    $('#sub').textContent = `pre-token protocols, valued from their peers' record \u00b7 DefiLlama snapshot ${D.as_of} \u00b7 model ${D.model_version}, fitted and tested on this snapshot`;
    const c = D.cap.coverage;
    const k = [
      ['Value miss, held-out', `${xm(capBest.loo)} <small>vs ${xm(capBase.loo)} flat</small>`, `typical miss on ${D.cap.n} traded caps hidden from the fit; walk-forward ${xm(capBest.wf)}`],
      ['Is the range honest?', `${share(c.in50_wf)} \u00b7 ${share(c.in80_wf)}`, `of later-listed caps fell inside P25\u2013P75 \u00b7 P10\u2013P90 (stated 50% \u00b7 80%)`],
      ['Token odds, Brier', `${oddsBest.cv.toFixed(3)} <small>vs ${oddsBase.cv.toFixed(3)}</small>`, `10-fold vs the ${share(D.odds.base_rate)} base rate; walk-forward ${oddsBest.wf.toFixed(3)} vs ${oddsBase.wf.toFixed(3)}`],
      ['Terms that earned a place', `${D.cap.kept.length} of ${D.cap.steps.length - 1} \u00b7 ${D.odds.kept.length} of ${D.odds.steps.length - 1}`, 'value model \u00b7 token odds; a term stays only if both held-out tests improve'],
      ['Worth farming', `${counts.GO} of ${D.rows.length}`, `net beats a ${share(P.tbill_rate)} T-bill and $${P.hourly_bar_usd}/hr; ${counts.WATCH} marginal, ${counts.PASS} skip`],
      ['Watchlist ranked', `${D.checks.watchlist_ranked} / ${D.checks.watchlist}`, `plus ${D.rows.length - D.checks.watchlist_ranked} off-list pre-token protocols`],
    ];
    $('#kpis').innerHTML = k.map(([t, b, s]) => `<div class="kpi"><span class="kt">${esc(t)}</span><b>${b}</b><span>${esc(s)}</span></div>`).join('');
    const tot = D.accounting.reduce((s, g) => s + g.n, 0);
    $('#acct').innerHTML = `<div class="ahead"><b>Protocol accounting</b><span>all ${D.checks.protocols} snapshot protocols, each in exactly one group</span></div>
      <div class="abar">${D.accounting.map((g) => `<i class="g-${g.key}" style="width:${(g.n / tot) * 100}%"></i>`).join('')}</div>
      <div class="alegend">${D.accounting.map((g) => `<span><i class="g-${g.key}"></i>${esc(g.label)} <b>${g.n}</b></span>`).join('')}</div>
      <div class="checks"><span>\u2713 ${D.checks.accounted} of ${D.checks.protocols} accounted</span><span>\u2713 ranks 1\u2013${D.rows.length}, values never rise</span><span>\u2713 watchlist ${D.checks.watchlist_ranked} of ${D.checks.watchlist}</span><span>\u2713 board.json sha256 ${esc(D.checks.board_sha256)}</span><span>\u2713 total implied ${money(D.checks.total_implied_usd)}</span></div>`;
    const cats = [...new Set(D.rows.map((r) => r.c || 'Uncategorised'))].sort();
    $('#cat').innerHTML = '<option value="">All categories</option>' + cats.map((c) => `<option>${esc(c)}</option>`).join('');
    const ch = {};
    D.rows.forEach((r) => r.ch.forEach((c) => (ch[c] = (ch[c] || 0) + 1)));
    const top = Object.keys(ch).sort((a, b) => ch[b] - ch[a] || (a < b ? -1 : 1)).slice(0, 30).sort();
    $('#chain').innerHTML = '<option value="">All chains</option>' + top.map((c) => `<option>${esc(c)}</option>`).join('');
  }

  function filtered() {
    const q = state.q.toLowerCase();
    const rows = D.rows.filter((r) =>
      (!q || r.n.toLowerCase().includes(q) || r.s.includes(q) || r.ch.some((c) => c.toLowerCase().includes(q))) &&
      (!state.cat || (r.c || 'Uncategorised') === state.cat) && (!state.chain || r.ch.includes(state.chain)) &&
      r.tvl >= state.tvl && (!state.wl || r.w) && (!state.early || !r.w) && (!state.up || (r.d7 != null && r.d7 > 0)) &&
      (!state.call || r.vd.call === state.call));
    const k = state.sort, dir = state.dir;
    return rows.slice().sort((a, b) => {
      const x = a[k], y = b[k];
      if (x == null && y == null) return a.r - b.r;
      if (x == null) return 1;
      if (y == null) return -1;
      return (typeof x === 'string' ? x.localeCompare(y) : x - y) * dir || a.r - b.r;
    });
  }

  const badge = (r) => `<span class="vb v-${r.vd.call}">${CALLS[r.vd.call]}</span>`;
  function rangeBar(r, lo, hi) {
    const L = Math.log10, a = L(lo), b = L(hi), at = (x) => Math.max(0, Math.min(100, ((L(x) - a) / (b - a)) * 100));
    return `<span class="rb"><i style="left:${at(r.v.p25_usd)}%;width:${Math.max(2, at(r.v.p75_usd) - at(r.v.p25_usd))}%"></i><em style="left:${at(r.v.implied_value_usd)}%"></em></span>`;
  }

  function board() {
    const rows = filtered();
    const lo = Math.min(...D.rows.map((r) => r.v.p25_usd)), hi = Math.max(...D.rows.map((r) => r.v.p75_usd));
    $('#tbl tbody').innerHTML = rows.length ? rows.map((r) => `<tr data-s="${esc(r.s)}" class="${r.s === state.sel ? 'sel' : ''}">
      <td class="num rk">${r.r}</td>
      <td><span class="pname">${esc(r.n)}</span>${r.w ? '<span class="tag w">watchlist</span>' : '<span class="tag e">off-list</span>'}<span class="chains">${esc(r.c || 'Uncategorised')} \u00b7 ${esc(r.ch.slice(0, 2).join(', '))}${r.ch.length > 2 ? ' +' + (r.ch.length - 2) : ''}</span></td>
      <td class="num">${money(r.tvl)}</td><td class="num ${cls(r.d7)}">${pct(r.d7)}</td><td class="num">${age(r)}</td>
      <td class="num"><div class="odds"><span>${share(r.v.odds)}</span><span class="ob"><i style="width:${r.v.odds * 100}%"></i></span></div></td>
      <td class="num">${money(r.v.value_if_launch_usd)}</td>
      <td class="num"><div class="ivcell"><b>${money(r.iv)}</b><span class="rng">${money(r.v.p25_usd)}\u2013${money(r.v.p75_usd)}</span>${rangeBar(r, lo, hi)}</div></td>
      <td class="num"><div class="vcell">${badge(r)}<span class="${r.vd.net_usd >= 0 ? 'up' : 'dn'}">${money(r.vd.net_per_hour_usd)}/hr</span></div></td>
    </tr>`).join('') : '<tr><td colspan="9" class="empty">No protocol matches these filters.</td></tr>';
    $('#count').textContent = `${rows.length} of ${D.rows.length} rows \u00b7 ${money(rows.reduce((s, r) => s + r.tvl, 0))} TVL \u00b7 ${money(rows.reduce((s, r) => s + r.iv, 0))} implied`;
    document.querySelectorAll('#tbl th').forEach((th) => { th.classList.toggle('sorted', th.dataset.k === state.sort); th.dataset.dir = state.dir > 0 ? '\u2191' : '\u2193'; });
    $('#calls').innerHTML = [['', `All ${D.rows.length}`], ['GO', `Farm ${counts.GO}`], ['WATCH', `Marginal ${counts.WATCH}`], ['PASS', `Skip ${counts.PASS}`]].map(([k, t]) => `<button data-call="${k}" class="${state.call === k ? 'on' : ''}">${t}</button>`).join('');
    const parts = [];
    if (state.call) parts.push(`${CALLS[state.call]} only`);
    if (state.cat) parts.push(state.cat);
    if (state.tvl) parts.push(`TVL \u2265 ${money(state.tvl)}`);
    if (state.sort !== 'r') parts.push(`by ${({ nph: 'net per hour', d7: '7-day change', tvl: 'TVL', odds: 'token odds', iv: 'implied value', ifl: 'value if it launches', age: 'time without a token', n: 'name' })[state.sort] || state.sort} ${state.dir < 0 ? '\u2193' : '\u2191'}`);
    $('#fnote').textContent = parts.join(' \u00b7 ');
    if (!state.sel || !D.rows.some((r) => r.s === state.sel)) state.sel = (rows[0] || D.rows[0]).s;
    detail();
  }

  function detail() {
    const r = D.rows.find((x) => x.s === state.sel);
    const v = r.v, vd = r.vd, ps = r.ps;
    $('#split').classList.toggle('full', state.full);
    document.body.classList.toggle('fullmode', state.full && state.tab === 'board');
    document.querySelectorAll('#tbl tbody tr').forEach((tr) => tr.classList.toggle('sel', tr.dataset.s === r.s));
    const how = `<h3>How the figure is made</h3><div class="how">
      <div><span>TVL <small>DefiLlama, ${esc(D.as_of)}</small></span><b>${money(r.tvl)}</b></div>
      <div><span>\u00d7 fitted cap / TVL <small>${xm(D.cap.at_100m)} at $100M TVL, size slope ${D.cap.size_slope} per ln TVL; held-out miss ${xm(capBest.loo)}</small></span><b>${xm(v.cap_ratio)}</b></div>
      <div class="sum"><span>= value if a token launches</span><b>${money(v.value_if_launch_usd)}</b></div>
      <div><span>\u00d7 token odds <small>${esc(D.odds.kept.join(', ') || 'base rate')}: share of peers like it that record a token (base rate ${share(D.odds.base_rate)})</small></span><b>${share(v.odds)}</b></div>
      <div class="sum tot"><span>= implied value</span><b>${money(v.implied_value_usd)}</b></div>
      <p class="small">P25\u2013P75 ${money(v.p25_usd)}\u2013${money(v.p75_usd)} \u00b7 P10\u2013P90 ${money(v.p10_usd)}\u2013${money(v.p90_usd)}, from the model's own held-out misses. The odds are the peers' record, not a forecast that this protocol will launch.</p></div>`;
    const grid = `<table class="grid"><thead><tr><th>Drop share</th>${vd.grid_deposits.map((d) => `<th class="num">${money(d)}</th>`).join('')}</tr></thead><tbody>${vd.grid.map((row, i) => `<tr><td>${(P.grid_shares[i] * 100).toFixed(1)}%</td>${row.map((n, j) => `<td class="num ${n >= 0 ? 'gpos' : 'gneg'} ${P.grid_shares[i] === P.drop_share && vd.grid_deposits[j] === vd.deposit_usd ? 'gsel' : ''}">${money(n)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    const verdict = `<h3>Farm verdict ${badge(r)}</h3>
      <p class="vtext">${money(vd.deposit_usd)} held ${vd.weeks} weeks earns a modelled drop of <b>${money(vd.drop_usd)}</b> against <b>${money(vd.gas_usd + vd.fees_usd + vd.tbill_usd)}</b> of cost (gas ${money(vd.gas_usd)}, fees ${money(vd.fees_usd)}, T-bill forgone ${money(vd.tbill_usd)}): net <b class="${vd.net_usd >= 0 ? 'up' : 'dn'}">${money(vd.net_usd)}</b> for ${vd.hours} h hands-on, <b>${money(vd.net_per_hour_usd)}/hr</b>. Breaks even at a drop share of ${(vd.breakeven_share * 100).toFixed(2)}% (model ${(P.drop_share * 100).toFixed(0)}%).</p>
      <p class="small">Net by drop share \u00d7 deposit, after gas, fees and the T-bill:</p>${grid}`;
    const peers = `<h3>Nearest priced peers</h3><table class="peers"><thead><tr><th>Token</th><th>Category</th><th class="num">TVL</th><th class="num">Mcap</th><th class="num">Cap / TVL</th><th class="num">vs model</th></tr></thead><tbody>${r.pe.map((q) => `<tr><td>${esc(q.n)} <small>${esc(q.sy || '')}</small></td><td>${esc(q.c || '-')}</td><td class="num">${money(q.tvl)}</td><td class="num">${money(q.mc)}</td><td class="num">${xm(q.ra)}</td><td class="num">${xm(q.vs)}</td></tr>`).join('')}</tbody></table>`;
    const plan = `<h3>Farm plan \u00b7 ${r.fp.length} steps</h3><div class="psum"><div><span class="small">Capital</span><b>${money(ps.capital_usd)}</b></div><div><span class="small">Setup</span><b>${ps.setup_minutes} min</b></div><div><span class="small">Gas, plan</span><b>${money(ps.gas_low_usd)}\u2013${money(ps.gas_high_usd)}</b></div><div><span class="small">Hold</span><b>${ps.hold_weeks} wk</b></div></div>
      <ol class="plan">${r.fp.map((s) => `<li>${esc(s.text)}<div class="ct"><span data-l="Cost">${esc(s.cost)}</span><span data-l="Time">${esc(s.time)}</span></div></li>`).join('')}</ol>`;
    const head = `<div class="dhead"><div><p class="crumb">#${r.r} of ${D.rows.length} by implied value</p><h2>${esc(r.n)}</h2>
      <p class="meta">${r.w ? '<span class="tag w">watchlist</span>' : '<span class="tag e">off-list</span>'} ${esc(r.c || 'Uncategorised')} \u00b7 ${esc(r.ch.slice(0, 4).join(', '))}${r.ch.length > 4 ? ' +' + (r.ch.length - 4) : ''}</p></div>
      <button class="ghost tog" id="tog">${state.full ? '\u2190 Board' : 'Open full view'}</button></div>
      <div class="dk"><div><span class="small">Implied value</span><b class="big">${money(v.implied_value_usd)}</b></div><div><span class="small">If it launches</span><b>${money(v.value_if_launch_usd)}</b></div><div><span class="small">Token odds</span><b>${share(v.odds)}</b></div><div><span class="small">TVL \u00b7 7d</span><b>${money(r.tvl)} <span class="${cls(r.d7)}">${pct(r.d7)}</span></b></div><div><span class="small">No token</span><b>${age(r)}</b></div></div>`;
    $('#detail').innerHTML = state.full
      ? `${head}<div class="fcols"><div>${how}${peers}</div><div>${verdict}${plan}</div></div>`
      : `${head}${how}${verdict}${plan}`;
    $('#tog').onclick = () => { state.full = !state.full; writeHash(); detail(); window.scrollTo(0, 0); };
  }

  function model() {
    const c = D.cap, o = D.odds;
    const row = (s, a, b) => `<tr><td>${esc(s.label)}</td><td class="num">${a}</td><td class="num">${b}</td><td class="${s.kept ? 'up' : s.kept === false ? 'dn' : ''}">${s.kept == null ? 'baseline' : s.kept ? 'kept' : 'tested, dropped'}</td></tr>`;
    $('#model').innerHTML = `<div class="mgrid">
      <div class="card"><h2>Value if a token launches: held-out miss</h2><p>log(market cap / TVL) of the ${c.n} protocols whose token trades, fitted by ridge regression. Terms enter in order and stay only if the typical miss falls in both tests: leave-one-out, and walk-forward (fit on the earliest-listed 60%, predict the ${c.n_wf_test} listed later).</p>
        <table><thead><tr><th>Term</th><th class="num">Leave-one-out</th><th class="num">Walk-forward</th><th></th></tr></thead><tbody>${c.steps.map((s) => row(s, xm(s.loo), xm(s.wf))).join('')}</tbody></table>
        <p>Range check: P25\u2013P75 held ${share(c.coverage.in50_loo)} (leave-one-out) and ${share(c.coverage.in50_wf)} (walk-forward) of real caps, stated 50%; P10\u2013P90 held ${share(c.coverage.in80_loo)} and ${share(c.coverage.in80_wf)}, stated 80%.</p></div>
      <div class="card"><h2>Token odds: Brier score</h2><p>Logistic regression of "records a token" over the ${o.n} protocols with a listing date (${o.n_token} record one). Same rule: a term stays only if both the 10-fold and the walk-forward Brier score fall.</p>
        <table><thead><tr><th>Term</th><th class="num">10-fold</th><th class="num">Walk-forward</th><th></th></tr></thead><tbody>${o.steps.map((s) => row(s, s.cv.toFixed(4), s.wf.toFixed(4))).join('')}</tbody></table>
        <p>Reading it: age and category tell us most about whether a protocol records a token; size, growth and chain count add nothing once those are known.</p></div>
      <div class="card"><h2>Farm verdict</h2><pre class="f">drop   = odds \u00d7 value if launched \u00d7 drop share \u00d7 deposit / (TVL + deposit)
deposit = the plan's position, 0.1% of TVL ($1K to $10K)
cost   = gas (plan's chain) + ${(P.fee_rate * 100).toFixed(1)}% fees + ${share(P.tbill_rate)} T-bill on the deposit
net    = drop \u2212 cost         drop share ${(P.drop_share * 100).toFixed(0)}%
Farm      net &gt; 0 and \u2265 $${P.hourly_bar_usd} per hands-on hour
Marginal  net &gt; 0, under the bar
Skip      cost exceeds the drop</pre><p>The drop share is the one figure the snapshot cannot supply; each protocol's grid shows the net at other shares and at \u00bc, \u00bd, 1 and 2\u00bd times the deposit.</p></div>
      <div class="card"><h2>Accounting</h2><table><tbody>${D.accounting.map((g) => `<tr><td>${esc(g.label)}</td><td class="num">${g.n}</td></tr>`).join('')}<tr><td><b>Total</b></td><td class="num"><b>${D.checks.accounted} of ${D.checks.protocols}</b></td></tr></tbody></table></div></div>`;
  }

  function live() {
    $('#ltbl tbody').innerHTML = D.live.map((p) => `<tr><td>${esc(p.name)}</td><td>${esc(p.symbol || '-')}</td><td>${esc(p.category || '-')}</td><td class="num">${money(p.tvl_usd)}</td><td class="num">${money(p.mcap_usd)}</td><td class="num">${xm(p.ratio)}</td><td class="num">${xm(p.vs)}</td></tr>`).join('');
  }

  function tabs() {
    document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === state.tab));
    document.querySelectorAll('.pane').forEach((p) => p.classList.toggle('on', p.id === state.tab));
  }

  function bind() {
    const set = (id, k, f) => { const el = $(id); el.addEventListener(el.type === 'checkbox' ? 'change' : 'input', () => { state[k] = f(el); state.sel = null; writeHash(); board(); }); };
    set('#q', 'q', (e) => e.value); set('#cat', 'cat', (e) => e.value); set('#chain', 'chain', (e) => e.value);
    set('#tvl', 'tvl', (e) => Number(e.value)); set('#wl', 'wl', (e) => e.checked); set('#early', 'early', (e) => e.checked); set('#up', 'up', (e) => e.checked);
    $('#calls').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; state.call = b.dataset.call; state.sel = null; writeHash(); board(); });
    $('#reset').onclick = () => { Object.assign(state, { q: '', cat: '', chain: '', tvl: 0, wl: false, early: false, up: false, call: '', sort: 'r', dir: 1, sel: null, full: false }); syncInputs(); writeHash(); board(); };
    document.querySelectorAll('#tbl th').forEach((th) => th.addEventListener('click', () => {
      const k = th.dataset.k;
      if (state.sort === k) state.dir = -state.dir; else { state.sort = k; state.dir = k === 'n' || k === 'r' ? 1 : -1; }
      writeHash(); board();
    }));
    $('#tbl tbody').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-s]'); if (!tr) return; state.sel = tr.dataset.s; writeHash(); detail(); });
    document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => { state.tab = b.dataset.tab; writeHash(); tabs(); }));
  }
  function syncInputs() {
    $('#q').value = state.q; $('#cat').value = state.cat; $('#chain').value = state.chain; $('#tvl').value = String(state.tvl);
    $('#wl').checked = state.wl; $('#early').checked = state.early; $('#up').checked = state.up;
  }

  readHash(); header(); syncInputs(); bind(); model(); live(); tabs(); board();
})();
