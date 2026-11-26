// Wiring: tabs, controls, pins, compare dialog, sandbox inputs, keyboard (/ search, c compare, Esc), CSV export.
'use strict';
function download(name, text, type) { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: type })); a.download = name; a.click(); }
function exportRows() {
  return filtered().map(function (x) { var r = x.r, f = x.f; return { rank: r.r, slug: r.s, name: r.n, watchlist: !!r.w, tvl_usd: r.tvl, odds: r.v.odds, implied_value_usd: r.v.implied_value_usd, verdict: f.call, net_per_hour_usd: r2(f.ph) }; });
}
function render() {
  ['board', 'detail', 'method', 'comps'].forEach(function (t) { $(t).classList.toggle('on', S.tab === t); });
  [].forEach.call(document.querySelectorAll('#tabs button'), function (b) { var on = b.dataset.tab === S.tab || (S.tab === 'detail' && b.dataset.tab === 'board'); b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
  ['kpis', 'acct', 'formula', 'evid'].forEach(function (id) { $(id).style.display = S.sum ? '' : 'none'; });
  $('sum').textContent = S.sum ? 'Hide summary' : 'Show summary';
  if (S.tab === 'board') { controls(); board(); }
  if (S.tab === 'detail') detail();
  compare();
  writeHash();
}
function go(p) { S.p = p; S.tab = 'detail'; render(); scrollTo(0, 0); }
function onPin(e) { var b = e.target.closest('[data-pin]'); if (!b) return false; togglePin(b.dataset.pin); render(); return true; }
function bind() {
  $('tabs').onclick = function (e) { var b = e.target.closest('button'); if (b) { S.tab = b.dataset.tab; render(); scrollTo(0, 0); } };
  $('calls').onclick = function (e) { var b = e.target.closest('button'); if (b) { S.call = b.dataset.call; render(); } };
  $('tiers').onclick = function (e) { var b = e.target.closest('button'); if (b) { S.tier = b.dataset.tier; render(); } };
  $('q').oninput = function () { S.q = this.value; render(); };
  ['cat', 'chain', 'dep', 'wk'].forEach(function (k) { $(k).onchange = function () { S[k] = this.value; render(); }; });
  $('tb').onchange = function () { S.tb = Number(this.value); render(); };
  $('sh').oninput = function () { S.sh = Number(this.value); render(); };
  $('sum').onclick = function () { S.sum = S.sum ? 0 : 1; render(); };
  $('reset').onclick = function () { var p = S.pins; S = JSON.parse(JSON.stringify(DEF)); S.pins = p; syncInputs(); render(); };
  $('csv').onclick = function () { var rs = exportRows(), ks = Object.keys(rs[0] || {}); download('token-radar.csv', [ks.join(',')].concat(rs.map(function (r) { return ks.map(function (k) { var v = r[k]; return typeof v === 'string' && /[",]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(','); })).join('\n'), 'text/csv'); };
  $('cmpbar').onclick = function (e) {
    if (e.target.closest('[data-open]')) { S.cx = 1; render(); }
    if (e.target.closest('[data-clear]')) { S.pins = ''; render(); }
  };
  $('cmp').onclose = function () { if (S.cx) { S.cx = 0; render(); } };
  $('cmp').onclick = function (e) {
    if (e.target.closest('[data-clear]')) { S.pins = ''; render(); return; }
    if (e.target.closest('[data-close]')) { S.cx = 0; render(); return; }
    if (onPin(e)) return;
    var a = e.target.closest('a[data-p]'); if (a) { e.preventDefault(); S.cx = 0; go(a.dataset.p); }
  };
  $('tbl').onclick = function (e) {
    if (onPin(e)) return;
    var a = e.target.closest('a[data-p]');
    if (a) { e.preventDefault(); go(a.dataset.p); return; }
    var th = e.target.closest('th');
    if (th) { var k = th.dataset.k; S.dir = S.sort === k ? -S.dir : k === 'r' || k === 'n' || k === 'pin' ? 1 : -1; S.sort = k; render(); return; }
    var tr = e.target.closest('tr.row');
    if (tr) { S.open = S.open === tr.dataset.s ? '' : tr.dataset.s; render(); }
  };
  $('detail').onclick = function (e) {
    if (e.target.closest('[data-back]')) { S.tab = 'board'; render(); return; }
    if (e.target.closest('[data-sbreset]')) { S.xt = S.xg = S.xm = 0; S.sh = DEF.sh; S.dep = S.wk = 'plan'; syncInputs(); render(); return; }
    onPin(e);
  };
  // sandbox inputs reprice only its card, so a slider keeps focus
  $('detail').oninput = function (e) {
    var k = e.target.dataset.x; if (!k) return;
    S[k] = typeof DEF[k] === 'number' ? Number(e.target.value) : e.target.value;
    $('sbx').innerHTML = sandbox(bySlug(S.p)); syncInputs(); writeHash();
    var el = $('sbx').querySelector('[data-x="' + k + '"]'); if (el) el.focus();
  };
  addEventListener('keydown', function (e) {
    var typing = /INPUT|SELECT/.test(document.activeElement.tagName);
    if (e.key === '/' && !typing) { e.preventDefault(); S.cx = 0; S.tab = 'board'; render(); $('q').focus(); }
    if (e.key === 'c' && !typing && pins().length) { S.cx = S.cx ? 0 : 1; S.tab = 'board'; render(); }
    if (e.key === 'Escape') { if (S.cx) S.cx = 0; else if (S.tab !== 'board') S.tab = 'board'; else S.open = ''; render(); }
  });
  addEventListener('hashchange', function () { readHash(); syncInputs(); render(); });
}

readHash(); header(); method(); comps(); fillSelects(); syncInputs(); bind(); render();
