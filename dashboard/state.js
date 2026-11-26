// Page state. Everything lives in the URL hash (filters, sort, pins, sandbox), so every view is a link.
'use strict';
var DEF = { tab: 'board', call: 'all', tier: 'all', q: '', cat: '', chain: '', dep: 'plan', sh: V.drop_share * 100, wk: 'plan', tb: V.tbill_rate * 100, sort: 'r', dir: 1, open: '', p: '', sum: 1, pins: '', cx: 0, xt: 0, xg: 0, xm: 0 };
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
function settings(r) { return { dep: S.dep === 'plan' ? r.ps.deposit_usd : Number(S.dep), sh: S.sh / 100, wk: S.wk === 'plan' ? r.ps.weeks : Number(S.wk), tb: S.tb / 100 }; }
function live(r) { var s = settings(r); return farmPlan(r, s.dep, s.sh, s.wk, s.tb); }
function plain() { return S.dep === 'plan' && S.wk === 'plan' && S.sh === DEF.sh && S.tb === DEF.tb; }
// pins: up to four protocols kept for the compare panel
function pins() { return S.pins ? S.pins.split(',') : []; }
function togglePin(s) {
  var p = pins(), i = p.indexOf(s);
  if (i >= 0) p.splice(i, 1); else { p.push(s); if (p.length > 4) p.shift(); }
  S.pins = p.join(',');
}
function bySlug(s) { return D.rows.filter(function (x) { return x.s === s; })[0]; }
