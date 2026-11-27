// Cover: headline, stat strip, 758-protocol ledger with self-checks, out-of-sample evidence.
'use strict';
function kept(st) { return st.filter(function (s) { return s.kept; }); }
var capBest = kept(C.steps).slice(-1)[0] || C.steps[0], oddsBest = kept(O.steps).slice(-1)[0] || O.steps[0];
var counts = { FARM: 0, MARGINAL: 0, SKIP: 0 };
D.rows.forEach(function (r) { counts[r.vd.call]++; });
var RNG = '';
function acctN(k) { return (D.accounting.filter(function (g) { return g.key === k; })[0] || { n: 0 }).n; }

function header() {
  $('sub').textContent = 'pre-token protocols valued from their own record \u00b7 DefiLlama snapshot ' + D.as_of + ' \u00b7 model ' + D.model_version + ', fitted on this snapshot, no network';
  $('nb').textContent = D.rows.length; $('nc').textContent = D.live.length;
  var best = D.rows.slice().sort(function (a, b) { return b.vd.per_hour_usd - a.vd.per_hour_usd; })[0];
  var onBoard = acctN('watch') + acctN('early') + acctN('free');
  $('crit').innerHTML = '<p class="lead"><b>' + counts.FARM + '</b> of ' + D.rows.length + ' pre-token protocols are worth farming at $' + V.hourly_bar_usd + '/h after gas, fees and a ' + pct(V.tbill_rate) + ' T-bill <span>best: ' + esc(best.n) + ' ' + sg(best.vd.per_hour_usd) + '/h</span></p>';

  var ck = [
    ['rows ' + same + '/' + D.rows.length, same === D.rows.length],
    ['verdicts ' + sameV + '/' + D.rows.length, sameV === D.rows.length],
    ['what-ifs ' + sameS + '/' + nS, sameS === nS],
    ['watchlist ' + K.watchlist_ranked + '/' + K.watchlist, K.watchlist_ranked === K.watchlist],
    ['ledger ' + K.accounted + '/' + K.protocols, K.accounted === K.protocols],
    ['board ' + onBoard + ' no-token', onBoard === D.rows.length],
    ['ranks in order', D.rows.every(function (r, i) { return i === 0 || r.v.implied_value_usd <= D.rows[i - 1].v.implied_value_usd; })],
    ['total ' + m(K.total_implied_usd), true], ['sha ' + K.board_sha256.slice(0, 8), true],
    [K.names_in_code + ' names in code', K.names_in_code === 0],
  ];
  var pass = ck.filter(function (c) { return c[1]; }).length;
  var cell = function (k, v, d) { return '<div><span class="k">' + k + '</span><span class="v">' + v + '</span><span class="d">' + d + '</span></div>'; };
  $('kpis').innerHTML =
    cell('Watchlist', K.watchlist_ranked + '/' + K.watchlist, '+' + acctN('early') + ' off-list, +' + acctN('free') + ' version-named') +
    cell('Value miss, walk-fwd', x2(capBest.wf), 'vs ' + x2(C.steps[0].wf) + ' flat; left-out ' + x2(capBest.loo)) +
    cell('Token odds, Brier', oddsBest.wf.toFixed(3), 'vs ' + O.steps[0].wf.toFixed(3) + ' base, ' + O.n + ' peers') +
    cell('Range honest', pct(C.coverage.in50_wf) + ' \u00b7 ' + pct(C.coverage.in80_wf), 'in 50 \u00b7 80% bands; fresh 80% ' + pct(C.coverage.in80_fresh)) +
    cell('Worth farming', counts.FARM + ' / ' + D.rows.length, counts.MARGINAL + ' marginal \u00b7 ' + counts.SKIP + ' skip') +
    cell('Self-checks', '<em class="' + (pass === ck.length ? 'pos' : 'neg') + '">' + pass + '/' + ck.length + ' \u2713</em>', 'recomputed in this page');

  // ledger: ranked, token, fenced
  var COL = { watch: '#6f72f2', early: '#3fae86', free: '#2f8a6c', comps: '#d9a640', recorded: '#8c7d60' };
  var SH = { watch: 'Watchlist', early: 'Off-list', free: 'Version-named', comps: 'Comparables', recorded: 'Token, no cap' };
  var bar = '', leg = '', fen = 0, why = [];
  D.accounting.forEach(function (g) {
    if (!g.n) return;
    bar += '<i style="width:' + (100 * g.n / K.protocols) + '%;background:' + (COL[g.key] || '#3a404c') + '" title="' + esc(g.label) + ': ' + g.n + '"></i>';
    if (COL[g.key]) leg += '<span title="' + esc(g.label + ': ' + g.why) + '"><em style="background:' + COL[g.key] + '"></em>' + SH[g.key] + ' <b>' + g.n + '</b></span>';
    else { fen += g.n; why.push(g.label.split(' ')[0].toLowerCase() + ' ' + g.n); }
  });
  leg += '<span><em style="background:#3a404c"></em>Fenced <b>' + fen + '</b> <span class="faint">' + esc(why.join(' \u00b7 ')) + '</span></span>';
  $('acct').innerHTML = '<div class="arow"><h2>' + K.protocols + ' protocols <code>accountFor()</code></h2><div class="bar">' + bar + '</div></div><div class="legend">' + leg + '</div>' +
    '<div class="checks">' + ck.map(function (c) { return '<span class="ok' + (c[1] ? '' : ' bad') + '"><i>' + (c[1] ? '\u2713' : '\u2717') + '</i> ' + c[0] + '</span>'; }).join('') + '</div>';

  // out-of-sample evidence: baseline and kept terms per test, the rest folded into one row
  var cw = C.w, cv = C.coverage;
  var capF = { size: function (w) { return '(TVL/$100M)<sup>' + w.toFixed(3) + '</sup>'; }, growth: function (w) { return 'e<sup>' + w.toFixed(3) + ' tanh(7d%/20)</sup>'; }, chains: function (w) { return 'chains<sup>' + w.toFixed(3) + '</sup>'; }, age: function (w) { return '(1+years)<sup>' + w.toFixed(3) + '</sup>'; } };
  var tr = function (s, a, b) { return '<tr class="' + (s.kept ? 'kept' : 'base') + '"><td>' + esc(s.label) + '</td><td class="num">' + a + '</td><td class="num">' + b + '</td></tr>'; };
  var more = function (st) { return '<tr class="base"><td>' + (st.length - 1 - kept(st).length) + ' more tried, none lowers both</td><td class="num">\u2013</td><td class="num">\u2013</td></tr>'; };
  var tb = function (h, a, b, body) { return '<div><h3>' + h + '</h3><table class="t"><tr><th>Term, in order</th><th class="num">' + a + '</th><th class="num">' + b + '</th></tr>' + body + '</table></div>'; };
  var capT = [C.steps[0]].concat(kept(C.steps)).map(function (s) { return tr(s, x2(s.loo), x2(s.wf)); }).join('') + more(C.steps);
  var oddT = [O.steps[0]].concat(kept(O.steps)).map(function (s) { return tr(s, s.cv.toFixed(3), s.wf.toFixed(3)); }).join('') + more(O.steps);
  var rg = function (t, a, b) { return '<tr><td>' + t + '</td><td class="num">' + pct(a) + '</td><td class="num">' + pct(b) + '</td></tr>'; };
  var rngT = rg('within \u00d73 of the model', cv.in3x_loo, cv.in3x_wf) + rg('inside P25\u2013P75, stated 50%', cv.in50_loo, cv.in50_wf) + rg('inside P10\u2013P90, stated 80%', cv.in80_loo, cv.in80_wf) + '<tr class="kept"><td>fresh 80%: older fit \u2192 newer</td><td class="num">' + pct(cv.in80_older) + '</td><td class="num">' + pct(cv.in80_fresh) + '</td></tr>';
  RNG = tb('Is the printed range honest?', 'Left out', 'Walk-fwd', rngT);
  $('formula').innerHTML = '<h2>Out-of-sample evidence <span class="mut h2n">a term stays only if it lowers the held-out miss in both tests</span></h2>' +
    '<div class="oos">' + tb('Value if it launches \u00b7 typical miss, ' + C.n + ' traded tokens', 'Left out', 'Walk-fwd', capT) +
    tb('Token odds \u00b7 Brier, ' + O.n + ' peers', '10-fold', 'Walk-fwd', oddT) + RNG + '</div>' +
    '<p class="note"><b>Implied value = value if a token launches \u00d7 token odds.</b> Value = TVL \u00d7 ' + Math.exp(cw[0]).toFixed(3) + C.keys.map(function (k, i) { return ' \u00d7 ' + (capF[k] ? capF[k](cw[i + 1]) : k + ' ' + cw[i + 1].toFixed(3)); }).join('') + ' (' + (C.loss === 'huber' ? 'Huber' : 'least squares') + '); s.e. \u00b1 ' + C.se.slice(1).map(function (x) { return x.toFixed(2); }).join(', \u00b1 ') + ' (' + K.bootstrap + ' refits). <a href="#tab=method">All tables</a></p>';
}

// Evidence tab: terms tried, blind tests, range honesty, cap chart
function evidence() {
  var tag = function (s) { return s.kept === null ? '<span class="faint">baseline</span>' : s.kept ? '<span class="tag kept">kept</span>' : '<span class="tag drop">not kept</span>'; };
  var trc = function (s) { return '<tr class="' + (s.kept === null ? 'base' : s.kept ? 'kept' : '') + '"><td>' + esc(s.label) + '</td>'; };
  var capRows = C.steps.map(function (s) { return trc(s) + '<td class="num">' + x2(s.loo) + '</td><td class="num">' + x2(s.wf) + '</td><td class="num faint">' + x2(s.k10) + '</td><td>' + tag(s) + '</td></tr>'; }).join('');
  var oddRows = O.steps.map(function (s) { return trc(s) + '<td class="num">' + s.cv.toFixed(4) + '</td><td class="num">' + s.wf.toFixed(4) + '</td><td>' + tag(s) + '</td></tr>'; }).join('');
  var last = function (st) { var r = st[0]; st.forEach(function (x) { if (x.kept !== false) r = x; }); return r; };
  return '<div><h2>Value if it launches <code>fitCapModel()</code> <span class="mut h2n">' + kept(C.steps).length + ' of ' + (C.steps.length - 1) + ' terms kept</span></h2><table class="t"><tr><th>Term, added in order</th><th class="num">Left out</th><th class="num">Walk-fwd</th><th class="num">10-fold</th><th></th></tr>' + capRows + '</table>' +
    (C.alt ? '<p class="note">' + (C.alt.loss === 'huber' ? 'Huber' : 'Least squares') + ' ends at ' + x2(last(C.alt.steps).loo) + ' / ' + x2(last(C.alt.steps).wf) + ', larger in both. Miss: the multiple a hidden cap is off by.</p>' : '') + '</div>' +
    '<div><h2>Token odds <code>fitOdds()</code> <span class="mut h2n">' + kept(O.steps).length + ' of ' + (O.steps.length - 1) + ' kept</span></h2><table class="t"><tr><th>Term, by greedy search</th><th class="num">10-fold</th><th class="num">Walk-fwd</th><th></th></tr>' + oddRows + '</table><p class="note">Brier on peers it never saw; base rate ' + pct(O.base_rate) + '. Logit ' + O.w.slice(1).map(function (w, i) { return (w >= 0 ? '+' : '') + w.toFixed(2) + ' ' + O.keys[i]; }).join(' ') + '.</p></div>' +
    RNG.replace('</table></div>', '</table><p class="note">Fresh: the band rule fitted on the ' + C.n_wf_train + ' older tokens only, counted on the ' + C.n_wf_test + ' newer.</p></div>') +
    '<div><h2>Cap on TVL</h2>' + scatter(null, 290, 150) + '<p class="note">Amber: ' + C.n + ' traded tokens. Violet: the board if it launches. Band: P25\u2013P75.</p></div>';
}
