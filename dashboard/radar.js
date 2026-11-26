// Token Launch Radar page. Reads window.RADAR (data.js, written by main.ts) and renders the board,
// each protocol's full plan, the evidence and the comparables. It recomputes every implied value from
// the fitted coefficients and every verdict from the same formula as lib/verdict.ts, and says on the
// cover whether its figures equal board.json. State lives in the URL hash, so every view is a link.
(function () {
  'use strict';
  var D = window.RADAR;
  var $ = function (id) { return document.getElementById(id); };
  var LN = Math.log;
  var V = D.verdict;

  // ---------- formatting ----------
  function m(x) {
    var a = Math.abs(x), s = x < 0 ? '-' : '';
    if (a >= 1e9) return s + '$' + (a / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return s + '$' + (a / 1e6).toFixed(1) + 'M';
    if (a >= 1e4) return s + '$' + Math.round(a / 1e3) + 'K';
    if (a >= 100) return s + '$' + Math.round(a).toLocaleString('en-US');
    return s + '$' + a.toFixed(2);
  }
  function sg(x) { return (x >= 0 ? '+' : '-') + m(Math.abs(x)); }
  function pct(x, d) { return (x * 100).toFixed(d == null ? 0 : d) + '%'; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function age(d) { return d == null ? 'no date' : d < 60 ? d + ' d' : d < 365 ? Math.round(d / 30.4) + ' mo' : (d / 365.25).toFixed(1) + ' y'; }
  function x2(x) { return '\u00d7' + x.toFixed(2); }
  function cls(x) { return x >= 0 ? 'pos' : 'neg'; }

  // ---------- the model, repeated here ----------
  var asOf = Date.parse(D.as_of + 'T00:00:00Z');
  function years(r) { return r.l ? Math.max(0, (asOf - Date.parse(r.l + 'T00:00:00Z')) / (365.25 * 864e5)) : 1.5; }
  function col(key, r, table) {
    if (key === 'size') return LN(r.tvl / 1e8);
    if (key === 'growth') return Math.tanh((r.d7 == null ? 0 : r.d7) / 20);
    if (key === 'age') return LN(1 + years(r));
    if (key === 'chains') return LN(Math.max(1, r.ch.length));
    if (key === 'size2') return Math.pow(LN(r.tvl / 1e8), 2);
    if (key === 'agesize') return LN(1 + years(r)) * LN(r.tvl / 1e8);
    if (key === 'age2') return Math.pow(LN(1 + years(r)), 2);
    if (key === 'multi') return r.ch.length >= 3 ? 1 : 0;
    if (key === 'swing') return Math.tanh(Math.abs(r.d7 == null ? 0 : r.d7) / 20);
    if (key === 'eth') return r.ch.indexOf('Ethereum') >= 0 ? 1 : 0;
    if (key === 'young') return years(r) < 1 ? 1 : 0;
    if (key === 'sizeg') return LN(r.tvl / 1e8) * Math.tanh((r.d7 == null ? 0 : r.d7) / 20);
    if (key === 'knn') return knn(r);
    return (table && table[r.c == null ? 'Uncategorised' : r.c]) || 0;
  }
  // the nearest-peer term: token share of the k peers closest by size and years listed (own row left out)
  function r4(x) { return Math.round(x * 1e4) / 1e4; }
  function lgt(p) { return LN(p / (1 - p)); }
  function knn(r) {
    var O = D.odds, k = O.peers_k, b = O.peers_base, x = r4(LN(r.tvl / 1e8) / 2), z = r4(LN(1 + years(r)) / 0.5);
    var d = O.peers.filter(function (v) { return v[3] !== r.s; }).map(function (v) { return [Math.pow(v[0] - x, 2) + Math.pow(v[1] - z, 2), v[2], v[3]]; });
    d.sort(function (a, c) { return a[0] - c[0] || (a[2] < c[2] ? -1 : a[2] > c[2] ? 1 : 0); });
    var t = 0; for (var i = 0; i < k; i++) t += d[i][1];
    return lgt((t + 2 * b) / (k + 2)) - lgt(b);
  }
  function score(mod, r) { var z = mod.w[0]; for (var j = 0; j < mod.keys.length; j++) z += mod.w[j + 1] * col(mod.keys[j], r, mod.table); return z; }
  function impliedValue(r) {
    var ifl = r.tvl * Math.exp(score(D.cap, r));
    var o = 1 / (1 + Math.exp(-score(D.odds, r)));
    return { ifl: ifl, o: o, iv: Math.max(1, Math.round(ifl * o)) };
  }
  // lib/verdict.ts netFor, at any deposit, share, hold and T-bill yield
  function farmPlan(r, dep, sh, wk, tb) {
    var ps = r.ps, v = r.v;
    var drop = v.odds * v.value_if_launch_usd * sh * (dep / (r.tvl + dep));
    var gas = ps.gas_tx_usd * (ps.setup_txs + wk + ps.exit_txs);
    var fees = dep * ((2 * ps.fee_pct) / 100 + V.base_fee_rate);
    var bill = (dep * tb * wk * 7) / 365;
    var cost = gas + fees, net = drop - cost, beat = net - bill;
    var hours = (ps.setup_minutes + V.weekly_minutes * wk) / 60, ph = net / hours;
    return { drop: drop, gas: gas, fees: fees, bill: bill, cost: cost, net: net, beat: beat, hours: hours, ph: ph, call: beat / hours >= V.hourly_bar_usd ? 'FARM' : net > 0 ? 'MARGINAL' : 'SKIP' };
  }
  var r2 = function (x) { return Math.round(x * 100) / 100; };
  var same = 0, sameV = 0;
  D.rows.forEach(function (r) {
    if (impliedValue(r).iv === r.v.implied_value_usd) same++;
    if (r2(farmPlan(r, r.ps.deposit_usd, V.drop_share, r.ps.weeks, V.tbill_rate).net) === r.vd.net_usd) sameV++;
  });

  // ---------- state ----------
  var DEF = { tab: 'board', call: 'all', tier: 'all', q: '', cat: '', chain: '', dep: 'plan', sh: V.drop_share * 100, wk: 'plan', tb: V.tbill_rate * 100, sort: 'r', dir: 1, open: '', p: '', sum: 1 };
  var S = {};
  function readHash() {
    S = JSON.parse(JSON.stringify(DEF));
    location.hash.replace(/^#/, '').split('&').forEach(function (kv) {
      var i = kv.indexOf('='); if (i < 0) return;
      var k = kv.slice(0, i), v = decodeURIComponent(kv.slice(i + 1));
      if (k in DEF) S[k] = typeof DEF[k] === 'number' ? Number(v) : v;
    });
  }
  function writeHash() {
    var parts = [];
    for (var k in DEF) if (String(S[k]) !== String(DEF[k])) parts.push(k + '=' + encodeURIComponent(S[k]));
    history.replaceState(null, '', parts.length ? '#' + parts.join('&') : location.pathname);
  }
  function settings(r) {
    return { dep: S.dep === 'plan' ? r.ps.deposit_usd : Number(S.dep), sh: S.sh / 100, wk: S.wk === 'plan' ? r.ps.weeks : Number(S.wk), tb: S.tb / 100 };
  }
  function live(r) { var s = settings(r); return farmPlan(r, s.dep, s.sh, s.wk, s.tb); }
  var plain = function () { return S.dep === 'plan' && S.wk === 'plan' && S.sh === DEF.sh && S.tb === DEF.tb; };

  // ---------- header, KPIs, accounting, evidence ----------
  var C = D.cap, O = D.odds, K = D.checks;
  var kept = function (st) { return st.filter(function (s) { return s.kept; }); };
  var capBest = kept(C.steps).slice(-1)[0] || C.steps[0], oddsBest = kept(O.steps).slice(-1)[0] || O.steps[0];
  var counts = { FARM: 0, MARGINAL: 0, SKIP: 0 };
  D.rows.forEach(function (r) { counts[r.vd.call]++; });
  var best = D.rows.slice().sort(function (a, b) { return b.vd.per_hour_usd - a.vd.per_hour_usd; })[0];

  function header() {
    $('sub').textContent = 'pre-token protocols valued from their own record \u00b7 DefiLlama snapshot ' + D.as_of + ' \u00b7 ' + K.protocols + ' protocols \u00b7 model ' + D.model_version + ', fitted on this snapshot, no network';
    $('meta').innerHTML = '<b>' + K.watchlist_ranked + '/' + K.watchlist + '</b> watchlist ranked \u00b7 <b>' + same + '/' + D.rows.length + '</b> rows recomputed here = board.json';
    $('nb').textContent = D.rows.length; $('nc').textContent = D.live.length;
    var kpi = function (k, v, d) { return '<div class="kpi"><div class="k">' + k + '</div><div class="v">' + v + '</div><div class="d">' + d + '</div></div>'; };
    $('kpis').innerHTML =
      kpi('Value miss, walk-forward', x2(capBest.wf) + ' <small>vs ' + x2(C.steps[0].wf) + ' flat</small>', C.n_wf_test + ' newest traded tokens priced by a fit on the ' + C.n_wf_train + ' listed before ' + C.wf_cut + '; leave-one-out ' + x2(capBest.loo)) +
      kpi('Is the printed range honest?', pct(C.coverage.in50_wf) + ' \u00b7 ' + pct(C.coverage.in80_wf), 'newer caps inside P25\u2013P75 \u00b7 P10\u2013P90 (stated 50% \u00b7 80%); fresh test (band from older only) ' + pct(C.coverage.in50_fresh) + ' \u00b7 ' + pct(C.coverage.in80_fresh)) +
      kpi('Token odds, Brier', oddsBest.wf.toFixed(3) + ' <small>vs ' + O.steps[0].wf.toFixed(3) + '</small>', 'walk-forward vs the base rate, ' + O.n + ' stand-alone peers; ten-fold ' + oddsBest.cv.toFixed(3) + ' vs ' + O.steps[0].cv.toFixed(3)) +
      kpi('Terms that earned a place', kept(C.steps).length + ' of ' + (C.steps.length - 1) + ' \u00b7 ' + kept(O.steps).length + ' of ' + (O.steps.length - 1), 'launch value \u00b7 token odds; a term stays only if both blind tests improve') +
      kpi('Worth farming at $' + V.hourly_bar_usd + '/h', counts.FARM + ' <small>of ' + D.rows.length + '</small>', 'beats gas, fees and a 4% T-bill by $' + V.hourly_bar_usd + '/h at plan size; ' + counts.MARGINAL + ' marginal, ' + counts.SKIP + ' skip; best ' + esc(best.n) + ' ' + sg(best.vd.per_hour_usd) + '/h') +
      kpi('Watchlist ranked', K.watchlist_ranked + ' / ' + K.watchlist, 'plus ' + (D.rows.length - K.watchlist_ranked) + ' stand-alone off-list protocols over $5M with no token');

    var COL = { watch: '#3d3fd6', early: '#2fa37a', comps: '#e0a526', recorded: '#c9b28a', bridge: '#9aa3b3', staked: '#6e8fb8', exchange: '#d7838a', wrapped: '#b597d6', chain: '#55606f', kin: '#d2d6de', floor: '#eceef2' };
    var bar = '', leg = '';
    D.accounting.forEach(function (g) {
      if (!g.n) return;
      bar += '<i style="width:' + (100 * g.n / K.protocols) + '%;background:' + COL[g.key] + '" title="' + esc(g.label) + ': ' + g.n + '"></i>';
      leg += '<span title="' + esc(g.why) + '"><em style="background:' + COL[g.key] + '"></em>' + esc(g.label) + ' <b>' + g.n + '</b></span>';
    });
    var ok = function (t, good) { return '<span class="ok' + (good ? '' : ' bad') + '">' + (good ? '\u2713 ' : '\u2717 ') + t + '</span>'; };
    $('acct').innerHTML = '<h2>Protocol accounting <code>accountFor()</code> <span class="mut" style="font-weight:400;text-transform:none;letter-spacing:0">all ' + K.protocols + ' snapshot protocols, each in exactly one group, each group for one stated reason (hover)</span></h2>' +
      '<div class="bar">' + bar + '</div><div class="legend">' + leg + '</div><div class="checks">' +
      ok('this table = board.json: ' + same + ' of ' + D.rows.length + ' recomputed here', same === D.rows.length) +
      ok('verdicts recomputed: ' + sameV + ' of ' + D.rows.length, sameV === D.rows.length) +
      ok('ranks 1\u2013' + D.rows.length + ' in order, values never rise', D.rows.every(function (r, i) { return i === 0 || r.v.implied_value_usd <= D.rows[i - 1].v.implied_value_usd; })) +
      ok('ledger ' + K.accounted + ' of ' + K.protocols, K.accounted === K.protocols) +
      ok('watchlist ' + K.watchlist_ranked + ' of ' + K.watchlist, K.watchlist_ranked === K.watchlist) +
      ok('total ' + m(K.total_implied_usd), true) + ok('board.json sha256 ' + K.board_sha256, true) +
      ok(K.names_in_code + ' protocol names in ' + K.code_files + ' code files', K.names_in_code === 0) + '</div>';

    var cw = C.w, ow = O.w;
    function lastStep(st) { var r = st[0]; st.forEach(function (x) { if (x.kept !== false) r = x; }); return r; }
    var capF = { size: function (w) { return '(TVL / $100M)<sup>' + w.toFixed(3) + '</sup>'; }, growth: function (w) { return 'e<sup>' + w.toFixed(3) + ' tanh(7d% / 20)</sup>'; }, chains: function (w) { return 'chains<sup>' + w.toFixed(3) + '</sup>'; }, age: function (w) { return '(1 + years)<sup>' + w.toFixed(3) + '</sup>'; } };
    $('formula').innerHTML = '<b>Implied value = value if a token launches \u00d7 token odds.</b> Value if it launches = TVL \u00d7 ' + Math.exp(cw[0]).toFixed(3) + C.keys.map(function (k, i) { return ' \u00d7 ' + (capF[k] ? capF[k](cw[i + 1]) : k + ' ' + cw[i + 1].toFixed(3)); }).join('') + ', a ' + (C.loss === 'huber' ? 'Huber' : 'least-squares') + ' fit on ' + C.n + ' stand-alone traded tokens (coefficients \u00b1 ' + C.se.slice(1).map(function (x) { return x.toFixed(2); }).join(', \u00b1 ') + ' over ' + K.bootstrap + ' bootstrap refits). ' +
      'Token odds = the share of peers like it that record a token: a logistic fit on ' + O.n + ' stand-alone protocols over ' + O.kept.join(', ') + ' (logit ' + ow.slice(1).map(function (w, i) { return (w >= 0 ? '+' : '') + w.toFixed(2) + ' ' + O.keys[i]; }).join(' ') + '). The peers\u2019 record, not a forecast; no protocol is named in the code.';

    var capRows = C.steps.map(function (s) { return '<tr class="' + (s.kept === null ? 'base' : s.kept ? 'kept' : '') + '"><td>' + esc(s.label) + '</td><td class="num">' + x2(s.loo) + '</td><td class="num">' + x2(s.wf) + '</td><td class="num faint">' + x2(s.k10) + '</td><td>' + (s.kept === null ? '<span class="faint">baseline</span>' : s.kept ? '<span class="tag kept">kept</span>' : '<span class="tag drop">not kept</span>') + '</td></tr>'; }).join('');
    var oddRows = O.steps.map(function (s) { return '<tr class="' + (s.kept === null ? 'base' : s.kept ? 'kept' : '') + '"><td>' + esc(s.label) + '</td><td class="num">' + s.cv.toFixed(4) + '</td><td class="num">' + s.wf.toFixed(4) + '</td><td>' + (s.kept === null ? '<span class="faint">baseline</span>' : s.kept ? '<span class="tag kept">kept</span>' : '<span class="tag drop">not kept</span>') + '</td></tr>'; }).join('');
    var cv = C.coverage;
    $('evid').innerHTML =
      '<div><h2>Value if it launches <code>fitCapModel()</code></h2><table class="t"><tr><th>Term, added in order</th><th class="num">Left out</th><th class="num">Walk-fwd</th><th class="num">10-fold</th><th></th></tr>' + capRows + '</table>' + (C.alt ? '<p class="note"><b>Loss.</b> ' + (C.alt.loss === 'huber' ? 'Huber' : 'Least squares') + ' ends at ' + x2(lastStep(C.alt.steps).loo) + ' left out, ' + x2(lastStep(C.alt.steps).wf) + ' walk-forward (kept ' + C.alt.kept.length + '); ' + (C.loss === 'huber' ? 'Huber (a miss past \u00d7' + Math.exp(C.huber_delta).toFixed(1) + ' counts linearly) is smaller across both (geometric mean), so it is used.' : 'least squares is smaller across both, so it is used.') + '</p>' : '') + '<p class="note">Miss: the typical multiple a hidden token\u2019s real cap is off by. 10-fold is shown, never used to pick.</p></div>' +
      '<div><h2>Token odds <code>fitOdds()</code></h2><table class="t"><tr><th>Term, added in order</th><th class="num">10-fold</th><th class="num">Walk-fwd</th><th></th></tr>' + oddRows + '</table><p class="note">Brier score of \u201crecords a token\u201d on peers it never saw; base rate ' + pct(O.base_rate) + '. A category\u2019s token share is learned inside each training split only.</p></div>' +
      '<div><h2>Is the printed range honest?</h2><table class="t"><tr><th>Real caps inside</th><th class="num">Stated</th><th class="num">Left out</th><th class="num">Walk-fwd</th></tr>' +
      '<tr><td>within \u00d73 of the figure</td><td class="num faint">\u2013</td><td class="num">' + pct(cv.in3x_loo) + '</td><td class="num">' + pct(cv.in3x_wf) + '</td></tr>' +
      '<tr><td>P25\u2013P75</td><td class="num">50%</td><td class="num">' + pct(cv.in50_loo) + '</td><td class="num">' + pct(cv.in50_wf) + '</td></tr>' +
      '<tr><td>P10\u2013P90</td><td class="num">80%</td><td class="num">' + pct(cv.in80_loo) + '</td><td class="num">' + pct(cv.in80_wf) + '</td></tr>' +
      '<tr class="kept"><td>fresh: P25\u2013P75 from older only</td><td class="num">50%</td><td class="num">' + pct(cv.in50_older) + '</td><td class="num">' + pct(cv.in50_fresh) + '</td></tr>' +
      '<tr class="kept"><td>fresh: P10\u2013P90 from older only</td><td class="num">80%</td><td class="num">' + pct(cv.in80_older) + '</td><td class="num">' + pct(cv.in80_fresh) + '</td></tr></table>' +
      '<p class="note">Rows 2\u20133: the printed band, read from both tests\u2019 misses pooled (calibrated, not fresh). Rows 4\u20135: a fresh test, the band read from the ' + C.n_wf_train + ' older tokens only and counted on the ' + C.n_wf_test + ' newer ones it never saw: ' + pct(cv.in50_fresh) + ' \u00b7 ' + pct(cv.in80_fresh) + '.</p></div>' +
      '<div><h2>Cap on TVL <code>comps</code></h2>' + scatter(null, 290, 150) + '<p class="note">Amber: the ' + C.n + ' traded tokens at their cap. Violet: the board at its value if it launches. Line: the fitted curve (flat week, one chain); band: P25\u2013P75.</p></div>';
  }

  // cap vs TVL scatter; `hi` marks one board row
  function scatter(hi, W, H) {
    var lx = function (v) { return 24 + (LN(v) - LN(3e6)) / (LN(5e10) - LN(3e6)) * (W - 30); };
    var ly = function (v) { return H - 14 - (LN(Math.max(v, 1e4)) - LN(1e4)) / (LN(5e10) - LN(1e4)) * (H - 22); };
    var s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '">';
    [1e7, 1e8, 1e9, 1e10].forEach(function (t) { s += '<line class="ax" x1="' + lx(t) + '" x2="' + lx(t) + '" y1="4" y2="' + (H - 14) + '"/><text x="' + (lx(t) - 10) + '" y="' + (H - 3) + '">' + m(t).replace('.0', '').replace('.00', '') + '</text>'; });
    [1e5, 1e7, 1e9].forEach(function (t) { s += '<text x="0" y="' + (ly(t) + 3) + '">' + m(t).replace('.0', '').replace('.00', '') + '</text>'; });
    var band = '', line = '';
    for (var t = 3e6; t <= 5e10; t *= 1.6) {
      var c = t * Math.exp(C.w[0] + C.w[1] * LN(t / 1e8));
      line += (line ? 'L' : 'M') + lx(t).toFixed(1) + ' ' + ly(c).toFixed(1);
    }
    var up = [], dn = [];
    for (t = 3e6; t <= 5e10; t *= 1.6) { var c2 = t * Math.exp(C.w[0] + C.w[1] * LN(t / 1e8)); up.push(lx(t).toFixed(1) + ' ' + ly(c2 * Math.exp(C.bands.p75)).toFixed(1)); dn.unshift(lx(t).toFixed(1) + ' ' + ly(c2 * Math.exp(C.bands.p25)).toFixed(1)); }
    band = 'M' + up.join('L') + 'L' + dn.join('L') + 'Z';
    s += '<path d="' + band + '" fill="#3d3fd6" opacity=".09"/>';
    D.rows.forEach(function (r) { s += '<circle cx="' + lx(r.tvl).toFixed(1) + '" cy="' + ly(r.v.value_if_launch_usd).toFixed(1) + '" r="1.6" fill="#7b7de8" opacity=".55"/>'; });
    D.live.forEach(function (q) { s += '<circle cx="' + lx(q.tvl).toFixed(1) + '" cy="' + ly(q.mc).toFixed(1) + '" r="2" fill="#e0a526" opacity=".85"/>'; });
    s += '<path d="' + line + '" stroke="#e8ebf2" stroke-width="1.3" fill="none"/>';
    if (hi) s += '<circle cx="' + lx(hi.tvl) + '" cy="' + ly(hi.v.value_if_launch_usd) + '" r="5" fill="none" stroke="#b3242d" stroke-width="2"/>';
    return s + '</svg>';
  }

  // ---------- board ----------
  var COLS = [
    ['r', '# \u00b7 range', 1], ['n', 'Protocol', 0], ['tvl', 'TVL', 1], ['d7', '7D', 1], ['age', 'No token for', 1], ['o', 'Token odds', 1],
    ['ifl', 'If it launches', 1], ['iv', 'Implied \u00b7 P25\u2013P75', 1], ['net', 'Verdict \u00b7 net of fees', 1], ['nph', 'Net / hour', 1], ['plan', 'Farm plan', 0],
  ];
  function key(r, k, f) {
    return { r: r.r, n: r.n.toLowerCase(), tvl: r.tvl, d7: r.d7 == null ? -1e9 : r.d7, age: r.v.days_without_token == null ? -1 : r.v.days_without_token, o: r.v.odds, ifl: r.v.value_if_launch_usd, iv: r.v.implied_value_usd, net: f.net, nph: f.ph, plan: r.ps.verb }[k];
  }
  function filtered() {
    var q = S.q.toLowerCase();
    return D.rows.map(function (r) { return { r: r, f: live(r) }; }).filter(function (x) {
      var r = x.r;
      if (S.call !== 'all' && x.f.call !== S.call) return false;
      if (S.tier === 'watch' && !r.w) return false;
      if (S.tier === 'off' && r.w) return false;
      if (S.tier === 'early' && r.tvl >= D.floor_usd) return false;
      if (S.cat && r.c !== S.cat) return false;
      if (S.chain && r.ch.indexOf(S.chain) < 0) return false;
      if (q && (r.n + ' ' + r.c + ' ' + r.ch.join(' ')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    }).sort(function (a, b) {
      var ka = key(a.r, S.sort, a.f), kb = key(b.r, S.sort, b.f);
      return (ka < kb ? -1 : ka > kb ? 1 : a.r.r - b.r.r) * S.dir;
    });
  }
  function rangeBar(v) {
    var lo = LN(1e5), hi = LN(1e9), p = function (x) { return Math.max(0, Math.min(100, (LN(Math.max(x, 1e5)) - lo) / (hi - lo) * 100)); };
    return '<span class="rng"><i style="left:' + p(v.p25_usd) + '%;width:' + (p(v.p75_usd) - p(v.p25_usd)) + '%"></i><u style="left:' + p(v.implied_value_usd) + '%"></u></span>';
  }
  function stepsTable(r, f) {
    var rows = r.fp.map(function (s, i) {
      if (s.when === 'Budget') return '';
      return '<tr><td class="when"><span class="n">' + (i + 1) + '</span>' + esc(s.when) + '</td><td>' + esc(s.text) + '</td><td class="num">' + m(s.cost_usd) + '</td><td class="num">' + (s.minutes >= 60 ? (s.minutes / 60).toFixed(1) + ' h' : s.minutes + ' min') + '</td></tr>';
    }).join('');
    var st = settings(r);
    return '<table class="steps"><tr><th>When</th><th>Step</th><th class="num">Cost</th><th class="num">Time</th></tr>' + rows +
      '<tr class="total"><td class="when">All in</td><td>' + (r.fp.length - 1) + ' steps over ' + st.wk + ' weeks on ' + m(st.dep) + ': expected drop ' + m(f.drop) + ' against ' + m(f.gas) + ' gas and ' + m(f.fees) + ' fees: net <b class="' + cls(f.net) + '">' + sg(f.net) + '</b>, ' + sg(f.ph) + ' an hour; a 4% T-bill on the same money earns ' + m(f.bill) + ', so farming ' + (f.beat >= 0 ? 'beats it by ' : 'trails it by ') + m(Math.abs(f.beat)) + ': <span class="call ' + f.call + '">' + f.call + '</span></td><td class="num">' + m(f.cost) + '</td><td class="num">' + f.hours.toFixed(1) + ' h</td></tr></table>';
  }
  function board() {
    var list = filtered();
    $('tbl').querySelector('thead').innerHTML = '<tr>' + COLS.map(function (c) { return '<th data-k="' + c[0] + '"' + (c[2] ? ' class="num"' : '') + '>' + c[1] + (S.sort === c[0] ? (S.dir > 0 ? ' \u25b2' : ' \u25bc') : '') + '</th>'; }).join('') + '</tr>';
    var html = '';
    list.forEach(function (x) {
      var r = x.r, f = x.f, v = r.v;
      html += '<tr class="row' + (S.open === r.s ? ' open' : '') + '" data-s="' + r.s + '">' +
        '<td class="rk"><b>' + r.r + '</b><small>' + r.rk[0] + '\u2013' + r.rk[1] + '</small></td>' +
        '<td><div class="pn"><a href="#tab=detail&p=' + r.s + '" data-p="' + r.s + '">' + esc(r.n) + '</a>' + (r.w ? '<span class="badge w">WATCHLIST</span>' : '<span class="badge o">OFF-LIST</span>') + (r.k ? '<span class="badge k" title="name stem of ' + esc(r.k) + '">KIN</span>' : '') + '</div><div class="sub">' + esc(r.c || 'Uncategorised') + ' \u00b7 ' + esc(r.ch[0] || '') + (r.ch.length > 1 ? ' +' + (r.ch.length - 1) : '') + '</div></td>' +
        '<td class="num">' + m(r.tvl) + '</td>' +
        '<td class="num ' + (r.d7 == null ? 'faint' : cls(r.d7)) + '">' + (r.d7 == null ? '\u2013' : (r.d7 >= 0 ? '+' : '') + r.d7.toFixed(1) + '%') + '</td>' +
        '<td class="num">' + age(v.days_without_token) + '</td>' +
        '<td class="num">' + pct(v.odds) + '<span class="odds"><i style="width:' + v.odds * 100 + '%"></i></span></td>' +
        '<td class="num">' + m(v.value_if_launch_usd) + '</td>' +
        '<td class="num"><span class="iv">' + m(v.implied_value_usd) + '</span>' + rangeBar(v) + '<span class="sub">' + m(v.p25_usd) + ' \u2013 ' + m(v.p75_usd) + '</span></td>' +
        '<td class="num"><span class="call ' + f.call + '">' + f.call + '</span> <b class="' + cls(f.net) + '">' + sg(f.net) + '</b><div class="sub">' + m(f.drop) + ' drop \u2212 ' + m(f.cost) + ' fees \u00b7 <b class="' + cls(f.beat) + '">' + sg(f.beat) + ' vs T-bill</b></div></td>' +
        '<td class="num ' + cls(f.ph) + '">' + sg(f.ph) + '<div class="sub">' + f.hours.toFixed(1) + ' h of work</div></td>' +
        '<td class="plan-cell">' + esc(r.ps.verb) + ' \u25be<span class="sub">' + m(settings(r).dep) + ' \u00b7 ' + settings(r).wk + ' wk \u00b7 ' + (r.fp.length - 1) + ' steps \u00b7 ' + esc(r.ps.chain) + '</span></td></tr>';
      if (S.open === r.s) html += '<tr class="plan"><td colspan="11">' + stepsTable(r, f) + '</td></tr>';
    });
    $('tbl').querySelector('tbody').innerHTML = html;
    legend(); wlbar();
    var iv = list.reduce(function (s, x) { return s + x.r.v.implied_value_usd; }, 0);
    $('count').innerHTML = '<b>' + list.length + '</b> of ' + D.rows.length + ' rows \u00b7 ' + m(iv) + ' implied in view' + (plain() ? ' \u00b7 verdicts at each plan\u2019s own deposit (0.05% of TVL, $1K\u2013$25K), hold and a ' + V.drop_share * 100 + '% drop share' : ' \u00b7 <b>what-if</b>: verdicts repriced at your settings; values unchanged') + ' \u00b7 click a row for its plan, a name for the full page';
  }
  function legend() {
    $('vleg').innerHTML = '<span class="call FARM">FARM</span> beats a ' + S.tb + '% T-bill on the same money by at least $' + V.hourly_bar_usd + ' per hour of work \u00b7 <span class="call MARGINAL">MARGINAL</span> beats gas and fees, not that bar (a red \u201cvs T-bill\u201d means parking the money pays more) \u00b7 <span class="call SKIP">SKIP</span> gas and fees exceed the expected drop';
  }
  function farmFrom(r) { var s = settings(r); return V.farm_deposits.filter(function (d) { return farmPlan(r, d, s.sh, s.wk, s.tb).call === 'FARM'; })[0] || null; }
  function med(xs) { xs = xs.slice().sort(function (a, b) { return a - b; }); var n = xs.length; return n ? (n % 2 ? xs[(n - 1) / 2] : (xs[n / 2 - 1] + xs[n / 2]) / 2) : 0; }
  function wlbar() {
    var el = $('wlbar');
    if (S.call !== 'FARM') { el.style.display = 'none'; return; }
    el.style.display = '';
    var ws = D.rows.filter(function (r) { return r.w; }).map(function (r) { return { r: r, f: live(r), s: settings(r) }; });
    var pass = ws.filter(function (x) { return x.f.call === 'FARM'; }).length;
    var near = ws.filter(function (x) { return x.f.call !== 'FARM'; }).sort(function (a, b) { return b.f.beat / b.f.hours - a.f.beat / a.f.hours; }).slice(0, 6);
    var rows = near.map(function (x) {
      var r = x.r, f = x.f, k = 1000 / x.s.dep, fd = farmFrom(r);
      return '<tr><td><b>' + esc(r.n) + '</b> <span class="call ' + f.call + '">' + f.call + '</span></td><td class="num">' + m(r.tvl) + '</td><td class="num">' + pct(r.v.odds) + '</td><td class="num">' + x.s.wk + ' wk</td><td class="num">' + m(f.drop * k) + '</td><td class="num">' + m((f.fees + f.bill) * k) + '</td><td class="num ' + cls(f.beat) + '">' + sg(f.beat / f.hours) + '/h</td><td class="num">' + (fd ? m(fd) : '<span class="neg">none</span>') + '</td></tr>';
    }).join('');
    el.innerHTML = '<h2>Watchlist at the FARM bar: ' + pass + ' of ' + ws.length + ' clear it at plan size</h2><table class="t"><tr><th>Closest watchlist names</th><th class="num">TVL</th><th class="num">Odds</th><th class="num">Hold</th><th class="num">Drop per $1K</th><th class="num">T-bill + fees per $1K</th><th class="num">vs T-bill</th><th class="num">FARM from deposit</th></tr>' + rows + '</table>' +
      '<p class="note">Why the list is off-list names: watchlist protocols are big, so a plan-size deposit (0.05% of TVL, capped at $25K) is a sliver of the pool and gets a sliver of the drop; their peers\u2019 odds are modest (median ' + pct(med(ws.map(function (x) { return x.r.v.odds; }))) + ') and the young ones are held longer, so the T-bill grows. The last column is the deposit at which each would clear FARM; the board does not raise deposits to make them pass.</p>';
  }
  function controls() {
    var cnt = function (c) { return D.rows.filter(function (r) { return c === 'all' || live(r).call === c; }).length; };
    $('calls').innerHTML = ['all', 'FARM', 'MARGINAL', 'SKIP'].map(function (c) { return '<button data-call="' + c + '" class="' + (S.call === c ? 'on' : '') + '">' + (c === 'all' ? 'All' : c[0] + c.slice(1).toLowerCase()) + ' ' + cnt(c) + '</button>'; }).join('');
    var tiers = [['all', 'All tiers'], ['watch', 'Watchlist ' + K.watchlist_ranked], ['off', 'Off-list ' + (D.rows.length - K.watchlist_ranked)], ['early', 'Early, < ' + m(D.floor_usd).replace('.0M', 'M')]];
    $('tiers').innerHTML = tiers.map(function (t) { return '<button data-tier="' + t[0] + '" class="' + (S.tier === t[0] ? 'on' : '') + '">' + t[1] + '</button>'; }).join('');
    $('shv').textContent = S.sh + '%';
  }
  function fillSelects() {
    var uniq = function (f) { var o = {}; D.rows.forEach(function (r) { [].concat(f(r)).forEach(function (x) { o[x] = (o[x] || 0) + 1; }); }); return Object.keys(o).sort(function (a, b) { return o[b] - o[a] || (a < b ? -1 : 1); }).map(function (k) { return [k, o[k]]; }); };
    $('cat').innerHTML = '<option value="">All categories</option>' + uniq(function (r) { return r.c || 'Uncategorised'; }).map(function (x) { return '<option value="' + esc(x[0]) + '">' + esc(x[0]) + ' (' + x[1] + ')</option>'; }).join('');
    $('chain').innerHTML = '<option value="">All chains</option>' + uniq(function (r) { return r.ch; }).map(function (x) { return '<option value="' + esc(x[0]) + '">' + esc(x[0]) + ' (' + x[1] + ')</option>'; }).join('');
    $('dep').innerHTML = '<option value="plan">plan size</option>' + [1000, 5000, 10000, 25000, 100000].map(function (d) { return '<option value="' + d + '">' + m(d) + '</option>'; }).join('');
    $('wk').innerHTML = '<option value="plan">plan hold</option>' + [4, 8, 13, 26, 52].map(function (w) { return '<option value="' + w + '">' + w + ' weeks</option>'; }).join('');
    $('tb').innerHTML = [0, 2, 4, 5, 8].map(function (t) { return '<option value="' + t + '">' + t + '%</option>'; }).join('');
  }
  function syncInputs() { $('q').value = S.q; $('cat').value = S.cat; $('chain').value = S.chain; $('dep').value = S.dep; $('sh').value = S.sh; $('wk').value = S.wk; $('tb').value = S.tb; }

  // ---------- one protocol's full page ----------
  function detail() {
    var r = D.rows.filter(function (x) { return x.s === S.p; })[0];
    if (!r) { $('detail').innerHTML = '<p>Unknown protocol.</p>'; return; }
    var v = r.v, f = live(r), st = settings(r), iv = impliedValue(r);
    var oddsTerms = O.keys.map(function (k, j) { return k + ' ' + (O.w[j + 1] * col(k, r, O.table) >= 0 ? '+' : '') + (O.w[j + 1] * col(k, r, O.table)).toFixed(2); }).join(', ');
    var build = [
      ['TVL', 'DefiLlama, ' + D.as_of + '; 7-day ' + (r.d7 == null ? 'n/a' : (r.d7 >= 0 ? '+' : '') + r.d7.toFixed(1) + '%'), m(r.tvl)],
      ['\u00d7 fitted cap / TVL', Math.exp(C.w[0]).toFixed(3) + ' at $100M \u00d7 (TVL/$100M)^' + C.w[1].toFixed(3) + ' \u2192 \u00d7' + v.cap_ratio.toFixed(4) + '; typical left-out miss ' + x2(capBest.loo), '\u00d7' + v.cap_ratio.toFixed(4)],
      ['= value if a token launches', 'what tokens of its size trade at today', m(v.value_if_launch_usd)],
      ['\u00d7 token odds', 'logit ' + O.w[0].toFixed(2) + ', ' + oddsTerms + ' \u2192 ' + pct(v.odds, 1) + ' (' + (v.age_years == null ? 'no listing date' : v.age_years + ' y listed') + ', ' + esc(r.c || 'Uncategorised') + ')', pct(v.odds, 1)],
      ['= implied value', 'recomputed in this page: ' + m(iv.iv) + (iv.iv === v.implied_value_usd ? ' = board.json' : ' \u2260 board.json'), m(v.implied_value_usd)],
    ].map(function (b, i) { return '<tr' + (i === 2 || i === 4 ? ' class="kept"' : '') + '><td>' + b[0] + '</td><td class="mut">' + b[1] + '</td><td class="num">' + b[2] + '</td></tr>'; }).join('');
    var peers = r.pe.map(function (q) { return '<tr><td>' + esc(q.n) + ' <span class="faint">' + esc(q.sy || '') + '</span></td><td class="mut">' + esc(q.c) + '</td><td class="num">' + m(q.tvl) + '</td><td class="num">' + m(q.mc) + '</td><td class="num">' + m(q.b) + '</td><td class="num ' + (Math.abs(LN(q.m)) < LN(3) ? 'pos' : 'neg') + '">' + x2(q.m) + '</td></tr>'; }).join('');
    var sens = r.sv.map(function (s) { return '<tr><td>' + esc(s.k) + '</td><td class="num">' + m(s.ifl) + '</td><td class="num">' + pct(s.o) + '</td><td class="num">' + m(s.iv) + '</td><td class="num">' + x2(s.x) + '</td></tr>'; }).join('');
    var grid = '<tr><th>Drop share \u2193 \u00b7 deposit \u2192</th>' + V.grid_deposits.map(function (d) { return '<th class="num">' + m(d) + '</th>'; }).join('') + '</tr>' +
      V.grid_shares.map(function (sh, i) { return '<tr><td>' + (sh * 100).toFixed(1) + '%</td>' + V.grid_deposits.map(function (d, j) { var n = r.vd.grid[i][j]; return '<td class="num ' + cls(n) + '">' + sg(n) + '</td>'; }).join('') + '</tr>'; }).join('');
    var wk = '<tr><th>Drop share \u2193 \u00b7 weeks \u2192</th>' + V.grid_weeks.map(function (w) { return '<th class="num">' + w + ' wk</th>'; }).join('') + '</tr>' +
      V.grid_shares.map(function (sh, i) { return '<tr><td>' + (sh * 100).toFixed(1) + '%</td>' + r.vd.by_weeks[i].map(function (n) { return '<td class="num ' + cls(n) + '">' + sg(n) + '</td>'; }).join('') + '</tr>'; }).join('');
    var cat = D.rows.filter(function (x) { return x.c === r.c; }), fd = farmFrom(r);
    var bench = [
      ['Same ' + m(st.dep) + ' in a ' + S.tb + '% T-bill, ' + st.wk + ' weeks', m(f.bill)],
      ['Drop if a token does launch (odds not applied)', m(f.drop / v.odds)],
      ['Gas and fees, all ' + (r.fp.length - 1) + ' steps', m(f.cost)],
      ['Drop share that covers gas and fees', pct(r.vd.breakeven_share, 2)],
      ['Drop share that clears FARM at this deposit', pct(r.vd.farm_share, 2)],
      ['Smallest deposit that clears FARM', f.call === 'FARM' ? 'this plan, ' + m(st.dep) : fd ? m(fd) : 'none up to $1M'],
      ['Median net / hour, ' + esc(r.c || 'Uncategorised') + ' (' + cat.length + ' rows)', sg(med(cat.map(function (x) { return live(x).ph; }))) + '/h'],
      ['Median net / hour, whole board (' + D.rows.length + ')', sg(med(D.rows.map(function (x) { return live(x).ph; }))) + '/h'],
      ['Exit if TVL prints below', m(r.tvl * 0.7)],
    ].map(function (b) { return '<tr><td>' + b[0] + '</td><td class="num">' + b[1] + '</td></tr>'; }).join('');
    $('detail').innerHTML =
      '<button class="back" data-back="1">\u2190 Board, filters kept</button>' +
      '<div class="card dhead"><div><span class="mut">#' + r.r + ' of ' + D.rows.length + ' by implied value \u00b7 rank range ' + r.rk[0] + '\u2013' + r.rk[1] + ' over ' + K.bootstrap + ' bootstrap refits</span><h2 class="name">' + esc(r.n) + (r.w ? '<span class="badge w">WATCHLIST</span>' : '<span class="badge o">OFF-LIST</span>') + '</h2><span class="sub">' + esc(r.c) + ' \u00b7 ' + esc(r.ch.join(', ')) + ' \u00b7 records no token' + (v.days_without_token == null ? '' : ', tracked ' + age(v.days_without_token)) + '</span>' +
      '<div class="dstats"><div><i>TVL</i><b>' + m(r.tvl) + '</b></div><div><i>7-day</i><b class="' + cls(r.d7 || 0) + '">' + (r.d7 == null ? '\u2013' : (r.d7 >= 0 ? '+' : '') + r.d7.toFixed(1) + '%') + '</b></div><div><i>Listed since</i><b>' + (r.l || 'no date') + '</b></div><div><i>Token odds</i><b>' + pct(v.odds) + '</b></div><div><i>If it launches</i><b>' + m(v.value_if_launch_usd) + '</b></div></div></div>' +
      '<div><span class="mut">Implied value</span><div class="big">' + m(v.implied_value_usd) + '</div><span class="sub">P25\u2013P75 ' + m(v.p25_usd) + '\u2013' + m(v.p75_usd) + ' \u00b7 P10\u2013P90 ' + m(v.p10_usd) + '\u2013' + m(v.p90_usd) + '</span></div>' +
      '<div><span class="mut">Farm verdict</span><div class="big" style="font-size:36px"><span class="call ' + f.call + '" style="font-size:15px;vertical-align:middle">' + f.call + '</span> <span class="' + cls(f.ph) + '">' + sg(f.ph) + '/h</span></div><span class="sub">net ' + sg(f.net) + ' on ' + m(st.dep) + ' over ' + st.wk + ' weeks; breaks even at a ' + pct(r.vd.breakeven_share, 2) + ' drop share</span></div></div>' +
      '<div class="dgrid"><div>' +
      '<div class="card"><h2>How the figure is made <code>impliedValue()</code></h2><table class="t">' + build + '</table><p class="note">The odds are the record of peers like it in this snapshot; they do not forecast that ' + esc(r.n) + ' will issue a token.</p></div>' +
      '<div class="card"><h2>Nearest traded comparables</h2><table class="t"><tr><th>Token</th><th>Category</th><th class="num">TVL</th><th class="num">Real cap</th><th class="num">Blind price</th><th class="num">Miss</th></tr>' + peers + '</table><p class="note">Blind price: each token priced by the curve fitted without it.</p></div>' +
      '<div class="card"><h2>What moves the value, on a changed record</h2><table class="t"><tr><th>If</th><th class="num">If launch</th><th class="num">Odds</th><th class="num">Implied</th><th class="num">vs now</th></tr>' + sens + '</table></div>' +
      '<div class="card"><h2>Cap on TVL: traded (amber), board (violet), this one (red)</h2>' + scatter(r, 520, 190) + '</div>' +
      '<div class="card"><h2>Benchmarks, at your settings</h2><table class="t">' + bench + '</table></div>' +
      '</div><div>' +
      '<div class="card"><h2>Farm plan <code>farmPlan()</code> \u00b7 ' + esc(r.ps.verb.toLowerCase()) + ' on ' + esc(r.ps.chain) + '</h2>' + stepsTable(r, f) + '</div>' +
      '<div class="cols2"><div class="card"><h2>Net by drop share \u00d7 deposit</h2><table class="t grid3">' + grid + '</table></div>' +
      '<div class="card"><h2>Net by drop share \u00d7 weeks held, plan deposit</h2><table class="t grid3">' + wk + '</table><p class="note">Net of gas and fees. FARM: after a T-bill on the same money, still $' + V.hourly_bar_usd + '/h of hands-on work; MARGINAL: beats gas and fees, not that bar; SKIP: gas and fees exceed the drop.</p></div></div>' +
      '</div></div>';
  }

  // ---------- method and comparables ----------
  function method() {
    $('method').innerHTML = '<div class="card method"><h2>Method and tests</h2>' +
      '<p><b>Universe.</b> All ' + K.protocols + ' snapshot protocols are read and each goes into exactly one group (cover bar). A protocol is a <i>form of something else</i> when its category is a bridge, a staked or restaked form, exchange custody or a chain, or its name says staked, wrapped or a version number; such forms are neither ranked nor used as comparables. A pre-token protocol whose name stem is the stem of a protocol already recording a token is <i>kin</i> of that token and set aside. The board ranks every watchlist slug plus every stand-alone pre-token protocol over $5M.</p>' +
      '<p><b>Value if a token launches.</b> A ' + (C.loss === 'huber' ? 'Huber (robust) ridge' : 'ridge') + ' regression of ln(market cap / TVL) over the ' + C.n + ' stand-alone traded tokens. Eleven candidate terms enter in a fixed order (size, category premium, 7-day growth, years listed, chain count, then size squared, years \u00d7 size, 3+ chains, size of the 7-day move, Ethereum, listed under a year). A term stays only if the typical miss falls in both blind tests: leave-one-out, and walk-forward (fit on the ' + C.n_wf_train + ' listed before ' + C.wf_cut + ', price the ' + C.n_wf_test + ' newer). Ten-fold is reported and never used to pick. The whole search runs twice, with least squares and with a Huber loss (set before the search at ' + C.huber_delta + ' log units), and the loss whose final model has the smaller typical miss across both blind tests (geometric mean) is used. Kept: ' + C.kept.join(', ') + '. Bigger protocols trade at a smaller multiple of TVL.</p>' +
      '<p><b>Token odds.</b> A penalised logistic regression of \u201crecords a token\u201d over ' + O.n + ' stand-alone protocols with a listing date (' + O.n_token + ' do). Fourteen candidate terms (years listed, category share, size, 7-day growth, chain count, years squared, years \u00d7 size, 3+ chains, size of the 7-day move, Ethereum, size squared, listed under a year, size \u00d7 growth, and the token share of the ' + O.peers_k + ' nearest peers by size and years listed) are searched without a fixed order: each round adds the term that lowers the Brier score most, among those that lower it in both ten-fold and walk-forward, and the search stops when none does; every term left over is shown tried on top of the final model. Kept: ' + O.kept.join(', ') + '. A protocol whose nearest peers (similar size, similar years listed) mostly record a token is likelier to have one; so are those in categories where most peers have one. Both shares are learned inside each training fold (a training row never counts itself in its nearest peers), shrunk toward the base rate; the page repeats the nearest-peer count from the ' + O.peers.length + ' peer points shipped with it. k = ' + O.peers_k + ' was set with 15 and 60 also tried; with 60 the ten-fold score is 0.1935.</p>' +
      '<p><b>Ranges.</b> P25\u2013P75 and P10\u2013P90 are quantiles of the model\u2019s held-out misses from both blind tests pooled (left-out and walk-forward), so the band is as wide as newer tokens need; because it is read from those same misses, its coverage is calibrated rather than a fresh test. A fresh test is printed beside it: the band read from the older tokens alone (each priced, left out, by a fit on the older tokens only), counted on the newer tokens it never saw. The cover prints how many real caps they held, left out and on newer tokens. Each row\u2019s rank range is the 5th\u201395th percentile of its rank over ' + K.bootstrap + ' bootstrap refits of both models (seeded, so every run is the same).</p>' +
      '<p><b>Farm verdict.</b> Expected drop = odds \u00d7 value if it launches \u00d7 drop share (' + V.drop_share * 100 + '%, the one figure the snapshot cannot supply) \u00d7 deposit / (TVL + deposit). Cost = gas on the cheapest listed chain for every transaction of the plan + fees in and out. A ' + V.tbill_rate * 100 + '% T-bill on the deposit for the hold is the bar: FARM beats it by at least $' + V.hourly_bar_usd + ' per hands-on hour; MARGINAL beats gas and fees only; SKIP does not. Yield earned inside the protocol is left out (the snapshot has no rates), which is why the T-bill is a bar and not a cost. Every plan has ten timed, costed steps plus its budget line, and the steps add up to the verdict\u2019s gas and fees. The deposit is 0.05% of TVL ($1K\u2013$25K), and no deposit is raised to make a row pass: the FARM view prints the deposit at which the closest watchlist names would; the hold is set by how long the protocol has gone without a token. Every control above the board reprices the verdicts with the same formula.</p>' +
      '<p><b>Integrity.</b> board.json is written once by main.ts; this page recomputes every value from the printed coefficients and every verdict from the formula and shows the match on the cover. main.ts also scans its own code and this page for any snapshot protocol name and prints the count: ' + K.names_in_code + '.</p></div>';
  }
  function comps() {
    var rows = D.live.map(function (q) { var x = q.mc / q.b; return '<tr><td>' + esc(q.n) + ' <span class="faint">' + esc(q.sy || '') + '</span></td><td class="mut">' + esc(q.c) + '</td><td class="num">' + (q.l || '\u2013') + '</td><td class="num">' + m(q.tvl) + '</td><td class="num">' + m(q.mc) + '</td><td class="num">' + (q.mc / q.tvl).toFixed(3) + '</td><td class="num">' + m(q.b) + '</td><td class="num ' + (Math.abs(LN(x)) < LN(3) ? 'pos' : 'neg') + '">' + x2(x) + '</td></tr>'; }).join('');
    $('comps').innerHTML = '<div class="card"><h2>The ' + D.live.length + ' comparables: stand-alone tokens that trade</h2><table class="t"><tr><th>Token</th><th>Category</th><th class="num">Listed</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">Cap / TVL</th><th class="num">Blind price</th><th class="num">Real / blind</th></tr>' + rows + '</table><p class="note">Blind price: the curve fitted on the other ' + (D.live.length - 1) + ' tokens. Green: within \u00d73.</p></div>';
  }

  // ---------- exports ----------
  function download(name, text, type) { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: type })); a.download = name; a.click(); }
  function exportRows() {
    return filtered().map(function (x) { var r = x.r, f = x.f; return { rank: r.r, slug: r.s, name: r.n, category: r.c, watchlist: !!r.w, tvl_usd: r.tvl, change_7d: r.d7, odds: r.v.odds, value_if_launch_usd: r.v.value_if_launch_usd, implied_value_usd: r.v.implied_value_usd, p25_usd: r.v.p25_usd, p75_usd: r.v.p75_usd, rank_lo: r.rk[0], rank_hi: r.rk[1], verdict: f.call, net_usd: r2(f.net), net_per_hour_usd: r2(f.ph) }; });
  }

  // ---------- wiring ----------
  function render() {
    ['board', 'detail', 'method', 'comps'].forEach(function (t) { $(t).classList.toggle('on', S.tab === t); });
    [].forEach.call(document.querySelectorAll('#tabs button'), function (b) { b.classList.toggle('on', b.dataset.tab === S.tab || (S.tab === 'detail' && b.dataset.tab === 'board')); });
    ['kpis', 'acct', 'formula', 'evid'].forEach(function (id) { $(id).style.display = S.sum ? '' : 'none'; });
    $('sum').textContent = S.sum ? 'Hide summary' : 'Show summary';
    if (S.tab === 'board') { controls(); board(); }
    if (S.tab === 'detail') detail();
    writeHash();
  }
  function bind() {
    $('tabs').onclick = function (e) { var b = e.target.closest('button'); if (b) { S.tab = b.dataset.tab; render(); scrollTo(0, 0); } };
    $('calls').onclick = function (e) { var b = e.target.closest('button'); if (b) { S.call = b.dataset.call; render(); } };
    $('tiers').onclick = function (e) { var b = e.target.closest('button'); if (b) { S.tier = b.dataset.tier; render(); } };
    $('q').oninput = function () { S.q = this.value; render(); };
    ['cat', 'chain', 'dep', 'wk'].forEach(function (k) { $(k).onchange = function () { S[k] = this.value; render(); }; });
    $('tb').onchange = function () { S.tb = Number(this.value); render(); };
    $('sh').oninput = function () { S.sh = Number(this.value); render(); };
    $('sum').onclick = function () { S.sum = S.sum ? 0 : 1; render(); };
    $('reset').onclick = function () { S = JSON.parse(JSON.stringify(DEF)); syncInputs(); render(); };
    $('csv').onclick = function () { var rs = exportRows(), ks = Object.keys(rs[0] || {}); download('token-radar.csv', [ks.join(',')].concat(rs.map(function (r) { return ks.map(function (k) { var v = r[k]; return typeof v === 'string' && /[",]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(','); })).join('\n'), 'text/csv'); };
    $('json').onclick = function () { download('token-radar.json', JSON.stringify(exportRows(), null, 1), 'application/json'); };
    $('tbl').onclick = function (e) {
      var a = e.target.closest('a[data-p]');
      if (a) { e.preventDefault(); S.p = a.dataset.p; S.tab = 'detail'; render(); scrollTo(0, 0); return; }
      var th = e.target.closest('th');
      if (th) { var k = th.dataset.k; S.dir = S.sort === k ? -S.dir : k === 'r' || k === 'n' ? 1 : -1; S.sort = k; render(); return; }
      var tr = e.target.closest('tr.row');
      if (tr) { S.open = S.open === tr.dataset.s ? '' : tr.dataset.s; render(); }
    };
    $('detail').onclick = function (e) { if (e.target.closest('[data-back]')) { S.tab = 'board'; render(); } };
    addEventListener('hashchange', function () { readHash(); syncInputs(); render(); });
  }

  readHash();
  header();
  method();
  comps();
  fillSelects();
  syncInputs();
  bind();
  render();
})();
