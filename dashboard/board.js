// The board: filters, sorting, ranked table with pins and in-row plans, watchlist FARM card.
'use strict';
var COLS = [
  ['pin', '<span title="Pin to compare">\u2606</span>', 0], ['r', '# \u00b7 range', 1], ['n', 'Protocol', 0], ['tvl', 'TVL \u00b7 7D', 1], ['age', 'No token', 1], ['o', 'Odds \u00b7 if launch', 1],
  ['iv', 'Implied \u00b7 P25\u2013P75', 1], ['net', 'Verdict \u00b7 net of fees', 1], ['nph', 'Net / hour', 1], ['plan', 'Farm plan', 0],
];
function sortKey(r, k, f) {
  return { pin: pins().indexOf(r.s) < 0 ? 1 : 0, r: r.r, n: r.n.toLowerCase(), tvl: r.tvl, d7: r.d7 == null ? -1e9 : r.d7, age: r.v.days_without_token == null ? -1 : r.v.days_without_token, o: r.v.odds, ifl: r.v.value_if_launch_usd, iv: r.v.implied_value_usd, net: f.net, nph: f.ph, plan: r.ps.verb }[k];
}
function filtered() {
  var q = S.q.toLowerCase(), pn = pins();
  return D.rows.map(function (r) { return { r: r, f: live(r) }; }).filter(function (x) {
    var r = x.r;
    if (S.call !== 'all' && x.f.call !== S.call) return false;
    if (S.tier === 'watch' && !r.w) return false;
    if (S.tier === 'off' && r.w) return false;
    if (S.tier === 'early' && r.tvl >= D.floor_usd) return false;
    if (S.tier === 'pins' && pn.indexOf(r.s) < 0) return false;
    if (S.cat && r.c !== S.cat) return false;
    if (S.chain && r.ch.indexOf(S.chain) < 0) return false;
    if (q && (r.n + ' ' + r.c + ' ' + r.ch.join(' ')).toLowerCase().indexOf(q) < 0) return false;
    return true;
  }).sort(function (a, b) {
    var ka = sortKey(a.r, S.sort, a.f), kb = sortKey(b.r, S.sort, b.f);
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
    '<tr class="total"><td class="when">All in</td><td>' + (r.fp.length - 1) + ' steps over ' + st.wk + ' weeks on ' + m(st.dep) + ': expected drop ' + m(f.drop) + ' against ' + m(f.gas) + ' gas and ' + m(f.fees) + ' fees: net <b class="' + cls(f.net) + '">' + sg(f.net) + '</b>, ' + sg(f.ph) + ' an hour; a 4% T-bill on the same money earns ' + m(f.bill) + ', so farming ' + (f.beat >= 0 ? 'beats it by ' : 'trails it by ') + m(Math.abs(f.beat)) + ': ' + callTag(f.call) + '</td><td class="num">' + m(f.cost) + '</td><td class="num">' + f.hours.toFixed(1) + ' h</td></tr></table>';
}
function rowHtml(r, f) {
  var v = r.v, on = pins().indexOf(r.s) >= 0, st = settings(r);
  return '<tr class="row' + (S.open === r.s ? ' open' : '') + (on ? ' pinned' : '') + '" data-s="' + r.s + '">' +
    '<td><button class="pin' + (on ? ' on' : '') + '" data-pin="' + r.s + '" aria-pressed="' + on + '" aria-label="Pin ' + esc(r.n) + ' to compare">' + (on ? '\u2605' : '\u2606') + '</button></td>' +
    '<td class="rk"><b>' + r.r + '</b><small>' + r.rk[0] + '\u2013' + r.rk[1] + '</small></td>' +
    '<td><div class="pn"><a href="#tab=detail&p=' + r.s + '" data-p="' + r.s + '">' + esc(r.n) + '</a>' + (r.w ? '<span class="badge w">WATCHLIST</span>' : '<span class="badge o">OFF-LIST</span>') + (r.k ? '<span class="badge k" title="name stem of ' + esc(r.k) + '">KIN</span>' : '') + '</div><div class="sub">' + esc(r.c || 'Uncategorised') + ' \u00b7 ' + esc(r.ch[0] || '') + (r.ch.length > 1 ? ' +' + (r.ch.length - 1) : '') + '</div></td>' +
    '<td class="num">' + m(r.tvl) + '<div class="sub ' + (r.d7 == null ? '' : cls(r.d7)) + '">' + d7s(r.d7) + '</div></td><td class="num">' + age(v.days_without_token) + '</td>' +
    '<td class="num">' + pct(v.odds) + '<span class="odds"><i style="width:' + v.odds * 100 + '%"></i></span><div class="sub">' + m(v.value_if_launch_usd) + '</div></td>' +
    '<td class="num"><span class="iv">' + m(v.implied_value_usd) + '</span>' + rangeBar(v) + '<span class="sub">' + m(v.p25_usd) + ' \u2013 ' + m(v.p75_usd) + '</span></td>' +
    '<td class="num">' + callTag(f.call) + ' <b class="' + cls(f.net) + '">' + sg(f.net) + '</b><div class="sub">' + m(f.drop) + ' drop \u2212 ' + m(f.cost) + ' fees \u00b7 <b class="' + cls(f.beat) + '">' + sg(f.beat) + ' vs T-bill</b></div></td>' +
    '<td class="num ' + cls(f.ph) + '">' + sg(f.ph) + '<div class="sub">' + f.hours.toFixed(1) + ' h of work</div></td>' +
    '<td class="plan-cell">' + esc(r.ps.verb) + ' \u25be<span class="sub">' + m(st.dep) + ' \u00b7 ' + st.wk + ' wk \u00b7 ' + (r.fp.length - 1) + ' steps \u00b7 ' + esc(r.ps.chain) + '</span></td></tr>' +
    (S.open === r.s ? '<tr class="plan"><td colspan="10">' + stepsTable(r, f) + '</td></tr>' : '');
}
function board() {
  var list = filtered();
  $('tbl').querySelector('thead').innerHTML = '<tr>' + COLS.map(function (c) { var on = S.sort === c[0]; return '<th data-k="' + c[0] + '"' + (c[2] ? ' class="num"' : '') + (on ? ' aria-sort="' + (S.dir > 0 ? 'ascending' : 'descending') + '"' : '') + '>' + c[1] + (on ? (S.dir > 0 ? ' \u25b2' : ' \u25bc') : '') + '</th>'; }).join('') + '</tr>';
  $('tbl').querySelector('tbody').innerHTML = list.map(function (x) { return rowHtml(x.r, x.f); }).join('');
  legend(); wlbar();
  var iv = list.reduce(function (s, x) { return s + x.r.v.implied_value_usd; }, 0);
  $('count').innerHTML = '<b>' + list.length + '</b> of ' + D.rows.length + ' rows \u00b7 ' + m(iv) + ' implied in view' + (plain() ? ' \u00b7 verdicts at each plan\u2019s deposit and hold, ' + V.drop_share * 100 + '% drop share' : ' \u00b7 <b>what-if</b>: verdicts repriced at your settings; values unchanged') + ' \u00b7 click a row for its plan, a name for its page';
}
function legend() {
  $('vleg').innerHTML = callTag('FARM') + ' beats a ' + S.tb + '% T-bill by $' + V.hourly_bar_usd + '+ per hour of work \u00b7 ' + callTag('MARGINAL') + ' beats gas and fees, not that bar \u00b7 ' + callTag('SKIP') + ' gas and fees exceed the drop';
}
function farmFrom(r) { var s = settings(r); return V.farm_deposits.filter(function (d) { return farmPlan(r, d, s.sh, s.wk, s.tb).call === 'FARM'; })[0] || null; }
function wlbar() {
  var el = $('wlbar');
  el.style.display = S.call === 'FARM' ? '' : 'none';
  if (S.call !== 'FARM') return;
  var ws = D.rows.filter(function (r) { return r.w; }).map(function (r) { return { r: r, f: live(r), s: settings(r) }; });
  var pass = ws.filter(function (x) { return x.f.call === 'FARM'; }).length;
  var near = ws.filter(function (x) { return x.f.call !== 'FARM'; }).sort(function (a, b) { return b.f.beat / b.f.hours - a.f.beat / a.f.hours; }).slice(0, 3);
  el.innerHTML = '<h2>Watchlist at the FARM bar: ' + pass + ' of ' + ws.length + ' clear it at plan size <span class="mut h2n">closest: ' + near.map(function (x) { var fd = farmFrom(x.r); return '<b>' + esc(x.r.n) + '</b> ' + sg(x.f.beat / x.f.hours) + '/h vs T-bill, FARM from ' + (fd ? m(fd) : 'no deposit') ; }).join(' \u00b7 ') + '</span></h2>';
}
function controls() {
  var cnt = function (c) { return D.rows.filter(function (r) { return c === 'all' || live(r).call === c; }).length; };
  var seg = function (attr, val, on, txt) { return '<button data-' + attr + '="' + val + '" class="' + (on ? 'on' : '') + '" aria-pressed="' + on + '">' + txt + '</button>'; };
  $('calls').innerHTML = ['all', 'FARM', 'MARGINAL', 'SKIP'].map(function (c) { return seg('call', c, S.call === c, (c === 'all' ? 'All' : c[0] + c.slice(1).toLowerCase()) + ' ' + cnt(c)); }).join('');
  var tiers = [['all', 'All tiers'], ['watch', 'Watchlist ' + K.watchlist_ranked], ['off', 'Off-list ' + (D.rows.length - K.watchlist_ranked)], ['early', 'Early, < ' + m(D.floor_usd).replace('.0M', 'M')], ['pins', '\u2605 Pinned ' + pins().length]];
  $('tiers').innerHTML = tiers.map(function (t) { return seg('tier', t[0], S.tier === t[0], t[1]); }).join('');
  $('shv').textContent = S.sh + '%';
}
function fillSelects() {
  var uniq = function (f) { var o = {}; D.rows.forEach(function (r) { [].concat(f(r)).forEach(function (x) { o[x] = (o[x] || 0) + 1; }); }); return Object.keys(o).sort(function (a, b) { return o[b] - o[a] || (a < b ? -1 : 1); }).map(function (k) { return [k, o[k]]; }); };
  var opts = function (xs) { return xs.map(function (x) { return '<option value="' + esc(x[0]) + '">' + esc(x[0]) + ' (' + x[1] + ')</option>'; }).join(''); };
  $('cat').innerHTML = '<option value="">All categories</option>' + opts(uniq(function (r) { return r.c || 'Uncategorised'; }));
  $('chain').innerHTML = '<option value="">All chains</option>' + opts(uniq(function (r) { return r.ch; }));
  $('dep').innerHTML = '<option value="plan">plan size</option>' + [1000, 5000, 10000, 25000, 100000].map(function (d) { return '<option value="' + d + '">' + m(d) + '</option>'; }).join('');
  $('wk').innerHTML = '<option value="plan">plan hold</option>' + [4, 8, 13, 26, 52].map(function (w) { return '<option value="' + w + '">' + w + ' weeks</option>'; }).join('');
  $('tb').innerHTML = [0, 2, 4, 5, 8].map(function (t) { return '<option value="' + t + '">' + t + '%</option>'; }).join('');
}
function syncInputs() { ['q', 'cat', 'chain', 'dep', 'sh', 'wk', 'tb'].forEach(function (k) { $(k).value = S[k]; }); }
