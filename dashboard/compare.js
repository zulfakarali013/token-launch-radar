// Compare: a tray naming the pins, and a dialog with the pinned protocols (up to four) side by side, best figure marked.
'use strict';
function compare() {
  var rs = pins().map(bySlug).filter(Boolean), dl = $('cmp');
  $('cmpbar').innerHTML = (rs.length ? '<b>\u2605 ' + rs.length + ' pinned</b> ' + rs.map(function (r) { return esc(r.n); }).join(' \u00b7 ') + ' <button data-open="1">Compare ' + rs.length + ' side by side \u25b8</button><button data-clear="1">Clear</button>' : '\u2606 pin up to 4 rows to compare them') + '<span class="faint"><kbd>c</kbd> compare \u00b7 <kbd>/</kbd> search \u00b7 <kbd>Esc</kbd> close</span>';
  if (!rs.length || !S.cx || S.tab !== 'board') { S.cx = 0; if (dl.open) dl.close(); return; }
  var fs = rs.map(live), st = rs.map(settings);
  // [label, value(i), rank-by(i) or null]
  var L = [
    ['Rank \u00b7 bootstrap range', function (i) { return '#' + rs[i].r + ' \u00b7 ' + rs[i].rk[0] + '\u2013' + rs[i].rk[1]; }, function (i) { return -rs[i].r; }],
    ['TVL \u00b7 7-day', function (i) { return m(rs[i].tvl) + ' \u00b7 ' + d7s(rs[i].d7); }, null],
    ['No token for', function (i) { return age(rs[i].v.days_without_token); }, null],
    ['Token odds (peers)', function (i) { return pct(rs[i].v.odds); }, function (i) { return rs[i].v.odds; }],
    ['Value if it launches', function (i) { return m(rs[i].v.value_if_launch_usd); }, function (i) { return rs[i].v.value_if_launch_usd; }],
    ['Implied value \u00b7 P25\u2013P75', function (i) { var v = rs[i].v; return '<b>' + m(v.implied_value_usd) + '</b> \u00b7 ' + m(v.p25_usd) + '\u2013' + m(v.p75_usd); }, function (i) { return rs[i].v.implied_value_usd; }],
    ['Plan: deposit \u00b7 hold \u00b7 chain', function (i) { return m(st[i].dep) + ' \u00b7 ' + st[i].wk + ' wk \u00b7 ' + esc(rs[i].ps.chain); }, null],
    ['Expected drop', function (i) { return m(fs[i].drop); }, function (i) { return fs[i].drop; }],
    ['Gas + fees, ' + (rs[0].fp.length - 1) + ' steps', function (i) { return m(fs[i].cost); }, function (i) { return -fs[i].cost; }],
    ['Net of fees \u00b7 vs T-bill', function (i) { return sg(fs[i].net) + ' \u00b7 ' + sg(fs[i].beat); }, function (i) { return fs[i].beat; }],
    ['Hands-on time', function (i) { return fs[i].hours.toFixed(1) + ' h'; }, function (i) { return -fs[i].hours; }],
    ['Net per hour \u00b7 verdict', function (i) { return '<b>' + sg(fs[i].ph) + '/h</b> ' + callTag(fs[i].call); }, function (i) { return fs[i].ph; }],
  ];
  var head = '<tr><th></th>' + rs.map(function (r) { return '<th><a href="#tab=detail&p=' + r.s + '" data-p="' + r.s + '">' + esc(r.n) + '</a> <button class="x" data-pin="' + r.s + '" aria-label="Unpin ' + esc(r.n) + '">\u00d7</button><div class="sub">' + esc(r.c || '') + (r.w ? ' \u00b7 watchlist' : ' \u00b7 off-list') + '</div></th>'; }).join('') + '</tr>';
  var body = L.map(function (l) {
    var best = -1;
    if (l[2] && rs.length > 1) rs.forEach(function (_, i) { if (best < 0 || l[2](i) > l[2](best)) best = i; });
    return '<tr><td>' + l[0] + '</td>' + rs.map(function (_, i) { return '<td class="num' + (i === best ? ' best' : '') + '">' + l[1](i) + '</td>'; }).join('') + '</tr>';
  }).join('');
  dl.innerHTML = '<h2>Compare pinned <span class="mut h2n">' + rs.length + ' of 4 \u00b7 farmPlan() at your settings \u00b7 green = best in the line</span> <button class="lnk" data-close="1">Close \u00d7</button><button class="lnk" data-clear="1">Clear pins</button></h2><table class="t cmp">' + head + body + '</table>';
  if (!dl.open) dl.showModal();
}
