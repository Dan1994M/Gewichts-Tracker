'use strict';
// ---------- Speicher ----------
const $ = s => document.querySelector(s);
const LS = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set: (k, v) => localStorage.setItem(k, JSON.stringify(v))
};
let entries = LS.get('wt_entries', {});           // { 'YYYY-MM-DD': { w, t, del? } }
let cfg = LS.get('wt_cfg', { goal: null, height: null, alpha: 0.1, appKey: '' });
let auth = LS.get('wt_auth', null);               // { refresh, access, exp }
const saveEntries = () => LS.set('wt_entries', entries);
const saveCfg = () => LS.set('wt_cfg', cfg);
if (navigator.storage?.persist) navigator.storage.persist();

// ---------- Helfer ----------
const today = () => new Date().toLocaleDateString('sv');      // YYYY-MM-DD lokal
const dnum = d => Date.parse(d) / 864e5;                      // Tag als Zahl
const fmtD = d => new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
const f1 = (x, s = '') => x == null || isNaN(x) ? '–' : (s && x > 0 ? '+' : '') + x.toFixed(1).replace('.', ',');
const f2 = (x, s = '') => x == null || isNaN(x) ? '–' : (s && x > 0 ? '+' : '') + x.toFixed(2).replace('.', ',');
const num = v => { const n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? null : n; };
const cls = x => x > 0 ? 'pos' : x < 0 ? 'neg' : '';
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('on'), 2200); }

// ---------- Analyse ----------
function series() {
  const list = Object.entries(entries).filter(([, e]) => !e.del).map(([d, e]) => ({ d, x: dnum(d), w: e.w })).sort((a, b) => a.x - b.x);
  let tr = null, px = null;
  for (const p of list) {   // EMA, Gap-korrigiert: alpha_eff = 1-(1-alpha)^Tage
    if (tr === null) tr = p.w; else tr += (1 - Math.pow(1 - cfg.alpha, p.x - px)) * (p.w - tr);
    p.tr = tr; px = p.x;
  }
  return list;
}
function slope(pts) {
  const n = pts.length; if (n < 2) return null;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const [x, y] of pts) { sx += x; sy += y; sxx += x * x; sxy += x * y; }
  const den = n * sxx - sx * sx; return den ? (n * sxy - sx * sy) / den : null;
}
const trendAt = (s, x) => { let r = null; for (const p of s) if (p.x <= x) r = p; return r; };
function analyze() {
  const s = series(); if (!s.length) return { s };
  const last = s[s.length - 1];
  const win = s.filter(p => p.x >= last.x - 28);
  const rateDay = win.length >= 5 && last.x - win[0].x >= 7 ? slope(win.map(p => [p.x, p.tr])) : null;
  const ch = days => { const p = trendAt(s, last.x - days); return p && p !== last ? last.tr - p.tr : null; };
  let eta = null;
  if (cfg.goal && rateDay) {
    const days = (cfg.goal - last.tr) / rateDay;
    if (days > 0 && days < 3650) eta = new Date((last.x + days) * 864e5);
  }
  const ws = s.map(p => p.w);
  return {
    s, last, rateWeek: rateDay == null ? null : rateDay * 7, ch7: ch(7), ch30: ch(30), eta,
    min: Math.min(...ws), max: Math.max(...ws),
    bmi: cfg.height ? last.tr / ((cfg.height / 100) ** 2) : null,
    sd: Math.sqrt(win.reduce((a, p) => a + (p.w - p.tr) ** 2, 0) / win.length)   // Tagesrauschen
  };
}

// ---------- Render ----------
function kpi(label, val, c = '') { return `<div><span>${label}</span><b class="${c}">${val}</b></div>`; }
function render() {
  const a = analyze();
  $('#quick').innerHTML = a.last
    ? kpi('Trend', f1(a.last.tr) + ' kg') + kpi('Rate/Woche', f2(a.rateWeek, 1) + ' kg', cls(a.rateWeek))
    : '<span class="hint">Noch keine Einträge.</span>';
  $('#recent').innerHTML = a.s.slice(-14).reverse().map(p =>
    `<div><span>${fmtD(p.d)}</span><span><b>${f1(p.w)}</b> <small>Trend ${f1(p.tr)}</small></span><button class="x" data-del="${p.d}">✕</button></div>`).join('');
  if (a.last) {
    $('#kpis').innerHTML =
      kpi('Trendgewicht', f1(a.last.tr) + ' kg') + kpi('Letzte Messung', f1(a.last.w) + ' kg') +
      kpi('Δ 7 Tage (Trend)', f2(a.ch7, 1) + ' kg', cls(a.ch7)) + kpi('Δ 30 Tage (Trend)', f2(a.ch30, 1) + ' kg', cls(a.ch30)) +
      kpi('Rate (28T-Regression)', f2(a.rateWeek, 1) + ' kg/W', cls(a.rateWeek)) +
      kpi('≈ Energiebilanz', a.rateWeek == null ? '–' : Math.round(a.rateWeek * 7700 / 7) + ' kcal/T') +
      kpi('Ziel', cfg.goal ? f1(cfg.goal) + ' kg' : '–') +
      kpi('Prognose Ziel', a.eta ? a.eta.toLocaleDateString('de-DE') : (cfg.goal ? 'nicht in Richtung' : '–')) +
      kpi('BMI (Trend)', a.bmi ? f1(a.bmi) : '–') + kpi('Tagesrauschen ±', f2(a.sd) + ' kg') +
      kpi('Min / Max', f1(a.min) + ' / ' + f1(a.max)) + kpi('Messungen', a.s.length);
    const m = {};
    for (const p of a.s) { const k = p.d.slice(0, 7); (m[k] ||= []).push(p.w); }
    let prev = null;
    const rows = Object.keys(m).sort().map(k => {
      const v = m[k], avg = v.reduce((x, y) => x + y) / v.length, d = prev == null ? null : avg - prev; prev = avg;
      return `<tr><td>${k.slice(5)}/${k.slice(2, 4)}</td><td>${f1(avg)}</td><td>${f1(Math.min(...v))}</td><td>${f1(Math.max(...v))}</td><td>${v.length}</td><td class="${cls(d)}">${f2(d, 1)}</td></tr>`;
    }).reverse().join('');
    $('#months').innerHTML = '<tr><th>Monat</th><th>Ø</th><th>Min</th><th>Max</th><th>n</th><th>Δ Ø</th></tr>' + rows;
  } else { $('#kpis').innerHTML = '<span class="hint">Noch keine Daten.</span>'; $('#months').innerHTML = ''; }
  drawChart(a.s);
}

let chart, range = 30;
function drawChart(s) {
  if (!window.Chart || !$('#t-ch').classList.contains('on')) return;
  const from = range && s.length ? s[s.length - 1].x - range : -Infinity;
  const v = s.filter(p => p.x >= from);
  const css = getComputedStyle(document.documentElement), c = n => css.getPropertyValue(n).trim();
  const ds = [
    { label: 'Messung', data: v.map(p => ({ x: p.x, y: p.w })), showLine: false, pointRadius: 3, backgroundColor: c('--mut') },
    { label: 'Trend', data: v.map(p => ({ x: p.x, y: p.tr })), borderColor: c('--acc'), borderWidth: 2.5, pointRadius: 0, tension: .3 }
  ];
  if (cfg.goal && v.length) ds.push({ label: 'Ziel', data: [{ x: v[0].x, y: cfg.goal }, { x: v[v.length - 1].x, y: cfg.goal }], borderColor: c('--ok'), borderDash: [6, 4], pointRadius: 0 });
  chart?.destroy();
  chart = new Chart($('#chart'), {
    type: 'line', data: { datasets: ds },
    options: {
      animation: false, interaction: { mode: 'nearest', intersect: false },
      plugins: { legend: { labels: { color: c('--fg') } },
        tooltip: { callbacks: { title: i => fmtD(i[0].parsed.x * 864e5), label: i => `${i.dataset.label}: ${f1(i.parsed.y)} kg` } } },
      scales: {
        x: { type: 'linear', ticks: { color: c('--mut'), maxTicksLimit: 6, callback: x => new Date(x * 864e5).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) }, grid: { color: c('--bd') } },
        y: { ticks: { color: c('--mut') }, grid: { color: c('--bd') } }
      }
    }
  });
}

// ---------- Eingabe ----------
function upsert(d, w) { entries[d] = { w, t: Date.now() }; saveEntries(); render(); scheduleSync(); }
$('#d').value = today();
$('#saveBtn').onclick = () => {
  const w = num($('#w').value), d = $('#d').value;
  if (!d || w == null || w < 20 || w > 400) return toast('Ungültiger Wert');
  upsert(d, Math.round(w * 10) / 10); $('#w').value = ''; $('#d').value = today(); toast('Gespeichert');
};
$('#recent').onclick = e => {
  const d = e.target.dataset.del; if (!d || !confirm(`Eintrag ${fmtD(d)} löschen?`)) return;
  entries[d] = { ...entries[d], t: Date.now(), del: true }; saveEntries(); render(); scheduleSync();
};

// ---------- Navigation ----------
document.querySelectorAll('nav button').forEach(b => b.onclick = () => {
  document.querySelectorAll('nav button,.tab').forEach(x => x.classList.remove('on'));
  b.classList.add('on'); $('#' + b.dataset.t).classList.add('on'); render();
});
$('#range').onclick = e => {
  if (!e.target.dataset.r) return;
  range = +e.target.dataset.r; document.querySelectorAll('#range button').forEach(x => x.classList.toggle('on', x === e.target)); render();
};

// ---------- Einstellungen ----------
$('#goal').value = cfg.goal ?? ''; $('#height').value = cfg.height ?? ''; $('#alpha').value = cfg.alpha; $('#appKey').value = cfg.appKey;
$('#saveSet').onclick = () => {
  cfg.goal = num($('#goal').value); cfg.height = num($('#height').value);
  const al = num($('#alpha').value); cfg.alpha = al && al > 0 && al < 1 ? al : 0.1;
  saveCfg(); render(); toast('Übernommen');
};

// ---------- Export / Import ----------
$('#exp').onclick = async () => {
  const csv = 'datum;gewicht\n' + series().map(p => `${p.d};${String(p.w).replace('.', ',')}`).join('\n');
  const file = new File([csv], `gewicht_${today()}.csv`, { type: 'text/csv' });
  if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file] }); return; } catch {} }
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name; a.click();
};
$('#imp').onchange = async e => {
  const txt = await e.target.files[0]?.text(); if (!txt) return;
  let n = 0;
  try {
    const j = JSON.parse(txt); for (const [d, v] of Object.entries(j.entries || j)) if (/^\d{4}-\d{2}-\d{2}$/.test(d) && v?.w) { entries[d] = { w: v.w, t: Date.now() }; n++; }
  } catch {
    const p = parseText(txt); n = applyImport(p.rows, true);
  }
  saveEntries(); render(); scheduleSync(); toast(`${n} Einträge importiert`); e.target.value = '';
};

// ---------- Text-Import (gemischte Formate) ----------
// Datum: TT.MM.JJ, TT.MM.JJJJ, T.M.JJ, TT/MM/JJ, JJJJ-MM-TT; Gewicht: erste Zahl 30–300 nach dem Datum, optional "kg"
function parseText(txt) {
  const rows = new Map(), bad = [];
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.trim(); if (!line || /^[-|:\s]+$/.test(line)) continue;   // leer / Markdown-Trennzeile
    let d = null, rest = '', m;
    if ((m = line.match(/(\d{4})-(\d{1,2})-(\d{1,2})/))) { d = [+m[1], +m[2], +m[3]]; }
    else if ((m = line.match(/(\d{1,2})[./](\d{1,2})[./](\d{4}|\d{2})(?!\d)/))) { const y = +m[3]; d = [y < 100 ? 2000 + y : y, +m[2], +m[1]]; }
    if (!d) { if (/\d/.test(line)) bad.push(line); continue; }
    rest = line.slice(m.index + m[0].length);
    const [y, mo, da] = d, dt = new Date(Date.UTC(y, mo - 1, da));
    if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== da || y < 1990 || dt > Date.now() + 864e5) { bad.push(line); continue; }
    const wm = [...rest.matchAll(/(\d{2,3}(?:[.,]\d{1,2})?)\s*(kg)?/gi)].map(x => num(x[1])).find(w => w >= 30 && w <= 300);
    if (wm == null) { bad.push(line); continue; }
    rows.set(dt.toISOString().slice(0, 10), Math.round(wm * 10) / 10);   // Duplikat am selben Tag: letzter gewinnt
  }
  return { rows: [...rows].sort(), bad };
}
function applyImport(rows, overwrite) {
  let n = 0;
  for (const [d, w] of rows) if (overwrite || !entries[d] || entries[d].del) { entries[d] = { w, t: Date.now() }; n++; }
  return n;
}
let txtParsed = null;
$('#txtCheck').onclick = () => {
  txtParsed = parseText($('#txtIn').value);
  const { rows, bad } = txtParsed, ex = rows.filter(([d]) => entries[d] && !entries[d].del);
  const diff = ex.filter(([d, w]) => entries[d].w !== w);
  $('#txtPrev').innerHTML = rows.length
    ? `<b>${rows.length}</b> Einträge erkannt (${fmtD(rows[0][0])} – ${fmtD(rows[rows.length - 1][0])}).<br>` +
      `Bereits vorhanden: ${ex.length}${diff.length ? `, davon <b>${diff.length} mit anderem Wert</b> (z. B. ${diff.slice(0, 3).map(([d, w]) => `${fmtD(d)}: ${f1(entries[d].w)} → ${f1(w)}`).join('; ')})` : ''}.<br>` +
      (bad.length ? `<b>${bad.length} Zeilen nicht erkannt:</b><br>${bad.slice(0, 10).map(l => '• ' + l.replace(/</g, '&lt;')).join('<br>')}${bad.length > 10 ? '<br>…' : ''}` : 'Alle Zeilen mit Ziffern erkannt.')
    : 'Keine Einträge erkannt.' + (bad.length ? '<br>' + bad.slice(0, 5).map(l => '• ' + l.replace(/</g, '&lt;')).join('<br>') : '');
  $('#txtGo').style.display = $('#txtOwL').style.display = rows.length ? '' : 'none';
};
$('#txtGo').onclick = () => {
  if (!txtParsed) return;
  const n = applyImport(txtParsed.rows, $('#txtOw').checked);
  saveEntries(); render(); scheduleSync(); toast(`${n} Einträge importiert`);
  $('#txtIn').value = ''; $('#txtPrev').innerHTML = ''; txtParsed = null; $('#txtGo').style.display = $('#txtOwL').style.display = 'none';
};

// ---------- Dropbox (PKCE, ohne Redirect -> Code einfügen; robust in iOS-PWA) ----------
const DBX_FILE = '/weights.json';
const b64url = a => btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function dbxTokenReq(params) {
  const r = await fetch('https://api.dropboxapi.com/oauth2/token', { method: 'POST', body: new URLSearchParams({ ...params, client_id: cfg.appKey }) });
  if (!r.ok) throw new Error('Token-Fehler ' + r.status);
  return r.json();
}
async function accessToken() {
  if (auth.access && auth.exp > Date.now() + 60e3) return auth.access;
  const j = await dbxTokenReq({ grant_type: 'refresh_token', refresh_token: auth.refresh });
  auth.access = j.access_token; auth.exp = Date.now() + j.expires_in * 1000; LS.set('wt_auth', auth);
  return auth.access;
}
$('#dbxAuth').onclick = async () => {
  cfg.appKey = $('#appKey').value.trim(); saveCfg();
  if (!cfg.appKey) return toast('App Key fehlt');
  const v = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const c = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v))));
  localStorage.setItem('wt_pkce', v);
  window.open(`https://www.dropbox.com/oauth2/authorize?client_id=${encodeURIComponent(cfg.appKey)}&response_type=code&code_challenge=${c}&code_challenge_method=S256&token_access_type=offline`, '_blank');
};
$('#dbxConnect').onclick = async () => {
  try {
    const j = await dbxTokenReq({ grant_type: 'authorization_code', code: $('#dbxCode').value.trim(), code_verifier: localStorage.getItem('wt_pkce') });
    auth = { refresh: j.refresh_token, access: j.access_token, exp: Date.now() + j.expires_in * 1000 };
    LS.set('wt_auth', auth); localStorage.removeItem('wt_pkce'); $('#dbxCode').value = '';
    dbxUI(); await sync(); toast('Dropbox verbunden');
  } catch (e) { toast(e.message); }
};
$('#dbxOut').onclick = () => { if (confirm('Dropbox trennen? Lokale Daten bleiben.')) { auth = null; localStorage.removeItem('wt_auth'); dbxUI(); } };
$('#dbxSync').onclick = () => sync(true);
function dbxUI() {
  $('#dbxOff').style.display = auth ? 'none' : ''; $('#dbxOn').style.display = auth ? '' : 'none';
  const ls = LS.get('wt_lastsync', null);
  $('#dbxInfo').textContent = 'Verbunden. Letzter Sync: ' + (ls ? new Date(ls).toLocaleString('de-DE') : '–');
  $('#sync').textContent = auth ? (ls ? '☁︎ ' + new Date(ls).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '☁︎') : '';
}
let syncing = false, syncTimer;
const scheduleSync = () => { if (auth) { clearTimeout(syncTimer); syncTimer = setTimeout(sync, 1500); } };
async function sync(manual) {
  if (!auth || syncing || !navigator.onLine) return;
  syncing = true; $('#sync').textContent = '☁︎ …';
  try {
    const tok = await accessToken();
    const r = await fetch('https://content.dropboxapi.com/2/files/download', { method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Dropbox-API-Arg': JSON.stringify({ path: DBX_FILE }) } });
    let remote = {};
    if (r.ok) remote = JSON.parse(await r.text()).entries || {};
    else if (r.status !== 409) throw new Error('Download ' + r.status);    // 409 = Datei existiert noch nicht
    let changed = false;
    for (const [d, e] of Object.entries(remote)) if (!entries[d] || e.t > entries[d].t) { entries[d] = e; changed = true; }
    const needUp = Object.entries(entries).some(([d, e]) => !remote[d] || remote[d].t < e.t);
    if (changed) { saveEntries(); render(); }
    if (needUp) {
      const u = await fetch('https://content.dropboxapi.com/2/files/upload', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/octet-stream', 'Dropbox-API-Arg': JSON.stringify({ path: DBX_FILE, mode: 'overwrite', mute: true }) },
        body: JSON.stringify({ v: 1, entries })
      });
      if (!u.ok) throw new Error('Upload ' + u.status);
    }
    LS.set('wt_lastsync', Date.now()); if (manual) toast('Synchronisiert');
  } catch (e) { toast('Sync: ' + e.message); }
  finally { syncing = false; dbxUI(); }
}

// ---------- Start ----------
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
document.addEventListener('visibilitychange', () => { if (!document.hidden) { $('#d').value ||= today(); sync(); } });
dbxUI(); render(); sync();
