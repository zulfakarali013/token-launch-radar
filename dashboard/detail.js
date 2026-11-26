// One protocol: its figure, comparables, costed plan, grids, benchmarks and sandbox.
'use strict';
function detail() {
  var r = bySlug(S.p);
  if (!r) { $('detail').innerHTML = '<p>Unknown protocol.</p>'; return; }
  var v = r.v, f = live(r), st = settings(r), iv = impliedValue(r);
  var oddsTerms = O.keys.map(function (k, j) { var t = O.w[j + 1] * col(k, r, O.table); return k + ' ' + (t >= 0 ? '+' : '') + t.toFixed(2); }).join(', ');
  var trs = function (rows, hl) { return rows.map(function (b, i) { return '<tr' + (hl && hl.indexOf(i) >= 0 ? ' class="kept"' : '') + '>' + b.map(function (c, j) { return '<td' + (j === b.length - 1 || (j && b.length > 3) ? ' class="num"' : j === 1 ? ' class="mut"' : '') + '>' + c + '</td>'; }).join('') + '</tr>'; }).join(''); };
  var build = trs([
    ['TVL', 'DefiLlama, ' + D.as_of + '; 7-day ' + d7s(r.d7), m(r.tvl)],
    ['\u00d7 fitted cap / TVL', Math.exp(C.w[0]).toFixed(3) + ' at $100M \u00d7 (TVL/$100M)^' + C.w[1].toFixed(3) + ' \u2192 \u00d7' + v.cap_ratio.toFixed(4) + '; typical left-out miss ' + x2(capBest.loo), '\u00d7' + v.cap_ratio.toFixed(4)],
    ['= value if a token launches', 'what tokens of its size trade at today', m(v.value_if_launch_usd)],
    ['\u00d7 token odds', 'logit ' + O.w[0].toFixed(2) + ', ' + oddsTerms + ' \u2192 ' + pct(v.odds, 1) + ' (' + (v.age_years == null ? 'no listing date' : v.age_years + ' y listed') + ', ' + esc(r.c || 'Uncategorised') + ')', pct(v.odds, 1)],
    ['= implied value', 'recomputed in this page: ' + m(iv.iv) + (iv.iv === v.implied_value_usd ? ' = board.json' : ' \u2260 board.json'), m(v.implied_value_usd)],
  ], [2, 4]);
  var peers = r.pe.map(function (q) { return '<tr><td>' + esc(q.n) + ' <span class="faint">' + esc(q.sy || '') + '</span></td><td class="mut">' + esc(q.c) + '</td><td class="num">' + m(q.tvl) + '</td><td class="num">' + m(q.mc) + '</td><td class="num">' + m(q.b) + '</td><td class="num ' + (Math.abs(LN(q.m)) < LN(3) ? 'pos' : 'neg') + '">' + x2(q.m) + '</td></tr>'; }).join('');
  var sens = trs(r.sv.map(function (s) { return [esc(s.k), m(s.ifl), pct(s.o), m(s.iv), x2(s.x)]; }));
  var gridT = function (lab, cols, rowsOf) { return '<table class="t"><tr><th>Drop share \u2193 \u00b7 ' + lab + ' \u2192</th>' + cols.map(function (c) { return '<th class="num">' + c + '</th>'; }).join('') + '</tr>' + V.grid_shares.map(function (sh, i) { return '<tr><td>' + (sh * 100).toFixed(1) + '%</td>' + rowsOf(i).map(function (n) { return '<td class="num ' + cls(n) + '">' + sg(n) + '</td>'; }).join('') + '</tr>'; }).join('') + '</table>'; };
  var cat = D.rows.filter(function (x) { return x.c === r.c; }), fd = farmFrom(r);
  var bench = trs([
    ['Same ' + m(st.dep) + ' in a ' + S.tb + '% T-bill, ' + st.wk + ' weeks', m(f.bill)],
    ['Drop if a token does launch (odds not applied)', m(f.drop / v.odds)],
    ['Gas and fees, all ' + (r.fp.length - 1) + ' steps', m(f.cost)],
    ['Drop share that covers gas and fees', pct(r.vd.breakeven_share, 2)],
    ['Smallest deposit that clears FARM', f.call === 'FARM' ? 'this plan, ' + m(st.dep) : fd ? m(fd) : 'none up to $1M'],
    ['Median net / hour, ' + esc(r.c || 'Uncategorised') + ' (' + cat.length + ' rows)', sg(med(cat.map(function (x) { return live(x).ph; }))) + '/h'],
    ['Exit if TVL prints below', m(r.tvl * 0.7)],
  ]);
  var on = pins().indexOf(r.s) >= 0, card = function (h, b) { return '<div class="card"><h2>' + h + '</h2>' + b + '</div>'; };
  $('detail').innerHTML =
    '<button class="back" data-back="1">\u2190 Board, filters kept</button><button class="back' + (on ? ' on' : '') + '" data-pin="' + r.s + '" aria-pressed="' + on + '">' + (on ? '\u2605 Pinned to compare' : '\u2606 Pin to compare') + '</button>' +
    '<div class="card dhead"><div><span class="mut">#' + r.r + ' of ' + D.rows.length + ' by implied value \u00b7 rank range ' + r.rk[0] + '\u2013' + r.rk[1] + ' over ' + K.bootstrap + ' bootstrap refits</span><h2 class="name">' + esc(r.n) + (r.w ? '<span class="badge w">WATCHLIST</span>' : '<span class="badge o">OFF-LIST</span>') + '</h2><span class="sub">' + esc(r.c) + ' \u00b7 ' + esc(r.ch.join(', ')) + ' \u00b7 records no token' + (v.days_without_token == null ? '' : ', tracked ' + age(v.days_without_token)) + '</span>' +
    '<div class="dstats"><div><i>TVL</i><b>' + m(r.tvl) + '</b></div><div><i>7-day</i><b class="' + cls(r.d7 || 0) + '">' + d7s(r.d7) + '</b></div><div><i>Listed since</i><b>' + (r.l || 'no date') + '</b></div><div><i>Token odds</i><b>' + pct(v.odds) + '</b></div><div><i>If it launches</i><b>' + m(v.value_if_launch_usd) + '</b></div></div></div>' +
    '<div><span class="mut">Implied value</span><div class="big">' + m(v.implied_value_usd) + '</div><span class="sub">P25\u2013P75 ' + m(v.p25_usd) + '\u2013' + m(v.p75_usd) + ' \u00b7 P10\u2013P90 ' + m(v.p10_usd) + '\u2013' + m(v.p90_usd) + '</span></div>' +
    '<div><span class="mut">Farm verdict</span><div class="big mid">' + callTag(f.call) + ' <span class="' + cls(f.ph) + '">' + sg(f.ph) + '/h</span></div><span class="sub">net ' + sg(f.net) + ' on ' + m(st.dep) + ', ' + st.wk + ' weeks</span></div></div>' +
    '<div class="dgrid"><div>' +
    card('How the figure is made <code>impliedValue()</code>', '<table class="t">' + build + '</table><p class="note">Odds: the record of peers like it here, not a forecast.</p>') +
    card('Nearest traded comparables', '<table class="t"><tr><th>Token</th><th>Category</th><th class="num">TVL</th><th class="num">Real cap</th><th class="num">Blind price</th><th class="num">Miss</th></tr>' + peers + '</table>') +
    card('What moves the value, on a changed record', '<table class="t"><tr><th>If</th><th class="num">If launch</th><th class="num">Odds</th><th class="num">Implied</th><th class="num">vs now</th></tr>' + sens + '</table>') +
    card('Cap on TVL: traded (amber), board (violet), this one (red)', scatter(r, 520, 170)) +
    card('Benchmarks, at your settings', '<table class="t">' + bench + '</table>') +
    '</div><div>' +
    card('Farm plan <code>farmPlan()</code> \u00b7 ' + esc(r.ps.verb.toLowerCase()) + ' on ' + esc(r.ps.chain), stepsTable(r, f)) +
    '<div class="card sandbox" id="sbx">' + sandbox(r) + '</div>' +
    '<div class="cols2">' + card('Net by drop share \u00d7 deposit', gridT('deposit', V.grid_deposits.map(m), function (i) { return r.vd.grid[i]; })) +
    card('Net by drop share \u00d7 weeks', gridT('weeks', V.grid_weeks.map(function (w) { return w + ' wk'; }), function (i) { return r.vd.by_weeks[i]; })) + '</div>' +
    '</div></div>';
}
