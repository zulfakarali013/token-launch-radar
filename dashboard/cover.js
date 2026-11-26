// The cover: five headline KPIs, the 758-protocol ledger with its self-checks, the formula, held-out evidence.
'use strict';
function kept(st) { return st.filter(function (s) { return s.kept; }); }
var capBest = kept(C.steps).slice(-1)[0] || C.steps[0], oddsBest = kept(O.steps).slice(-1)[0] || O.steps[0];
var counts = { FARM: 0, MARGINAL: 0, SKIP: 0 };
D.rows.forEach(function (r) { counts[r.vd.call]++; });
function acctN(k) { return (D.accounting.filter(function (g) { return g.key === k; })[0] || { n: 0 }).n; }

function header() {
  $('sub').textContent = 'pre-token protocols valued from their own record \u00b7 DefiLlama snapshot ' + D.as_of + ' \u00b7 model ' + D.model_version + ', fitted on this snapshot, no network';
  $('meta').innerHTML = '<b>' + K.watchlist_ranked + '/' + K.watchlist + '</b> watchlist ranked \u00b7 <b>' + same + '/' + D.rows.length + '</b> rows recomputed = board.json';
  $('nb').textContent = D.rows.length; $('nc').textContent = D.live.length;
  var best = D.rows.slice().sort(function (a, b) { return b.vd.per_hour_usd - a.vd.per_hour_usd; })[0];
  var kpi = function (k, v, d) { return '<div class="kpi"><div class="k">' + k + '</div><div class="v">' + v + '</div><div class="d">' + d + '</div></div>'; };
  $('kpis').innerHTML =
    kpi('Watchlist ranked', K.watchlist_ranked + ' / ' + K.watchlist, '+ ' + (D.rows.length - K.watchlist_ranked) + ' off-list, over $5M, no token') +
    kpi('Value miss, walk-forward', x2(capBest.wf) + ' <small>vs ' + x2(C.steps[0].wf) + ' flat</small>', C.n_wf_test + ' newest traded tokens, fit on the ' + C.n_wf_train + ' older; leave-one-out ' + x2(capBest.loo)) +
    kpi('Token odds, Brier', oddsBest.wf.toFixed(3) + ' <small>vs ' + O.steps[0].wf.toFixed(3) + '</small>', 'walk-forward vs base rate, ' + O.n + ' peers; ten-fold ' + oddsBest.cv.toFixed(3)) +
    kpi('Printed range honest?', pct(C.coverage.in50_wf) + ' \u00b7 ' + pct(C.coverage.in80_wf), 'newer caps inside P25\u2013P75 \u00b7 P10\u2013P90 (50% \u00b7 80%); fresh ' + pct(C.coverage.in50_fresh) + ' \u00b7 ' + pct(C.coverage.in80_fresh)) +
    kpi('Worth farming at $' + V.hourly_bar_usd + '/h', counts.FARM + ' <small>of ' + D.rows.length + '</small>', counts.MARGINAL + ' marginal, ' + counts.SKIP + ' skip after gas, fees, T-bill; best ' + esc(best.n) + ' ' + sg(best.vd.per_hour_usd) + '/h');

  var COL = { watch: '#6f72f2', early: '#3fae86', comps: '#d9a640', recorded: '#8c7d60' };
  var bar = '', leg = '';
  D.accounting.forEach(function (g) {
    if (!g.n) return;
    bar += '<i style="width:' + (100 * g.n / K.protocols) + '%;background:' + (COL[g.key] || '#4a505d') + '" title="' + esc(g.label) + ': ' + g.n + '"></i>';
    leg += '<span title="' + esc(g.why) + '"><em style="background:' + (COL[g.key] || '#4a505d') + '"></em>' + esc(g.label) + ' <b>' + g.n + '</b></span>';
  });
  var onBoard = acctN('watch') + acctN('early');
  var ck = [
    ['table = board.json: ' + same + '/' + D.rows.length + ' recomputed', same === D.rows.length],
    ['verdicts ' + sameV + '/' + D.rows.length, sameV === D.rows.length],
    ['what-ifs ' + sameS + '/' + nS, sameS === nS],
    ['watchlist ' + K.watchlist_ranked + '/' + K.watchlist, K.watchlist_ranked === K.watchlist],
    ['ledger ' + K.accounted + '/' + K.protocols, K.accounted === K.protocols],
    ['board = ' + onBoard + ' no-token rows; ' + (acctN('comps') + acctN('recorded')) + ' with a token kept off', onBoard === D.rows.length],
    ['ranks in order', D.rows.every(function (r, i) { return i === 0 || r.v.implied_value_usd <= D.rows[i - 1].v.implied_value_usd; })],
    ['total ' + m(K.total_implied_usd), true], ['sha256 ' + K.board_sha256, true],
    [K.names_in_code + ' names in ' + K.code_files + ' code files', K.names_in_code === 0],
  ];
  var pass = ck.filter(function (c) { return c[1]; }).length;
  $('acct').innerHTML = '<h2>Protocol accounting <code>accountFor()</code> <span class="mut h2n">all ' + K.protocols + ' snapshot protocols, each in one group for one reason (hover)</span></h2>' +
    '<div class="bar">' + bar + '</div><div class="legend">' + leg + '</div><div class="checks"><b class="ckh' + (pass === ck.length ? '' : ' bad') + '">Self-checks ' + pass + '/' + ck.length + ' \u2713</b>' +
    ck.map(function (c) { return '<span class="ok' + (c[1] ? '' : ' bad') + '"><i>' + (c[1] ? '\u2713' : '\u2717') + '</i> ' + c[0] + '</span>'; }).join('') + '</div>';

  var cw = C.w, ow = O.w;
  var capF = { size: function (w) { return '(TVL / $100M)<sup>' + w.toFixed(3) + '</sup>'; }, growth: function (w) { return 'e<sup>' + w.toFixed(3) + ' tanh(7d% / 20)</sup>'; }, chains: function (w) { return 'chains<sup>' + w.toFixed(3) + '</sup>'; }, age: function (w) { return '(1 + years)<sup>' + w.toFixed(3) + '</sup>'; } };
  $('formula').innerHTML = '<b>Implied value = value if a token launches \u00d7 token odds.</b> Value = TVL \u00d7 ' + Math.exp(cw[0]).toFixed(3) + C.keys.map(function (k, i) { return ' \u00d7 ' + (capF[k] ? capF[k](cw[i + 1]) : k + ' ' + cw[i + 1].toFixed(3)); }).join('') + ', ' + (C.loss === 'huber' ? 'Huber' : 'least-squares') + ' fit on ' + C.n + ' traded tokens (\u00b1 ' + C.se.slice(1).map(function (x) { return x.toFixed(2); }).join(', \u00b1 ') + ', ' + K.bootstrap + ' refits). ' +
    'Odds = logistic fit on ' + O.n + ' protocols (logit ' + ow.slice(1).map(function (w, i) { return (w >= 0 ? '+' : '') + w.toFixed(2) + ' ' + O.keys[i]; }).join(' ') + '): the peers\u2019 record, not a forecast; no protocol is named in the code.';
  $('evid').innerHTML = evidence(0);
}

// full = 1 (Evidence tab): every term tried; the cover shows kept terms only
function evidence(full) {
  var tag = function (s) { return s.kept === null ? '<span class="faint">baseline</span>' : s.kept ? '<span class="tag kept">kept</span>' : '<span class="tag drop">not kept</span>'; };
  var trc = function (s) { return '<tr class="' + (s.kept === null ? 'base' : s.kept ? 'kept' : '') + '"><td>' + esc(s.label) + '</td>'; };
  var pick = function (st) { return full ? st : st.filter(function (s) { return s.kept !== false; }); };
  var more = function (st, n) { var k = st.length - pick(st).length; return k ? '<tr><td colspan="' + n + '" class="faint">+ ' + k + ' more tried, not kept: Evidence tab</td></tr>' : ''; };
  var capRows = pick(C.steps).map(function (s) { return trc(s) + '<td class="num">' + x2(s.loo) + '</td><td class="num">' + x2(s.wf) + '</td><td class="num faint">' + x2(s.k10) + '</td><td>' + tag(s) + '</td></tr>'; }).join('') + more(C.steps, 5);
  var oddRows = pick(O.steps).map(function (s) { return trc(s) + '<td class="num">' + s.cv.toFixed(4) + '</td><td class="num">' + s.wf.toFixed(4) + '</td><td>' + tag(s) + '</td></tr>'; }).join('') + more(O.steps, 4);
  var last = function (st) { var r = st[0]; st.forEach(function (x) { if (x.kept !== false) r = x; }); return r; };
  var cv = C.coverage, cr = function (t, st, a, b) { return '<td>' + t + '</td><td class="num' + (st ? '' : ' faint') + '">' + (st || '\u2013') + '</td><td class="num">' + pct(a) + '</td><td class="num">' + pct(b) + '</td></tr>'; };
  return '<div><h2>Value if it launches <code>fitCapModel()</code> <span class="mut h2n">' + kept(C.steps).length + ' of ' + (C.steps.length - 1) + ' terms kept</span></h2><table class="t"><tr><th>Term, added in order</th><th class="num">Left out</th><th class="num">Walk-fwd</th><th class="num">10-fold</th><th></th></tr>' + capRows + '</table>' +
    (C.alt ? '<p class="note">' + (C.alt.loss === 'huber' ? 'Huber' : 'Least squares') + ' ends at ' + x2(last(C.alt.steps).loo) + ' / ' + x2(last(C.alt.steps).wf) + ', larger in both. Miss: the multiple a hidden cap is off by.</p>' : '') + '</div>' +
    '<div><h2>Token odds <code>fitOdds()</code> <span class="mut h2n">' + kept(O.steps).length + ' of ' + (O.steps.length - 1) + ' kept</span></h2><table class="t"><tr><th>Term, by greedy search</th><th class="num">10-fold</th><th class="num">Walk-fwd</th><th></th></tr>' + oddRows + '</table><p class="note">Brier on peers it never saw; base rate ' + pct(O.base_rate) + '.</p></div>' +
    '<div><h2>Is the printed range honest?</h2><table class="t"><tr><th>Real caps inside</th><th class="num">Stated</th><th class="num">Left out</th><th class="num">Walk-fwd</th></tr><tr>' +
    cr('within \u00d73', '', cv.in3x_loo, cv.in3x_wf) + '<tr>' + cr('P25\u2013P75', '50%', cv.in50_loo, cv.in50_wf) + '<tr>' + cr('P10\u2013P90', '80%', cv.in80_loo, cv.in80_wf) +
    '<tr class="kept">' + cr('fresh P25\u2013P75', '50%', cv.in50_older, cv.in50_fresh) + '<tr class="kept">' + cr('fresh P10\u2013P90', '80%', cv.in80_older, cv.in80_fresh) + '</table>' +
    '<p class="note">Fresh: band read from the ' + C.n_wf_train + ' older tokens only, counted on the ' + C.n_wf_test + ' newer.</p></div>' +
    '<div><h2>Cap on TVL</h2>' + scatter(null, 290, 150) + '<p class="note">Amber: ' + C.n + ' traded tokens. Violet: the board if it launches. Band: P25\u2013P75.</p></div>';
}
