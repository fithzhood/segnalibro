'use strict';

/* ---------- dati ---------- */
const KEY = 'segnalibro.items';
const PREFS = 'segnalibro.prefs';
// siti dove il link di ogni episodio ha un codice diverso: di base il link resta fisso
const FIXED_HOSTS = /hianimes\.se|hianime\.city|bato\.to|tcbonepiece|facebook\.com|fb\.watch|streamingcommunity/i;
const UNIT = {
  anime: { short: 'Ep.', the: "l'episodio", of: "dell'episodio", to: "all'episodio", one: 'episodio', many: 'episodi', seen: 'visti', seenLabel: 'Episodi visti' },
  serie: { short: 'Ep.', the: "l'episodio", of: "dell'episodio", to: "all'episodio", one: 'episodio', many: 'episodi', seen: 'visti', seenLabel: 'Episodi visti' },
  manga: { short: 'Cap.', the: 'il capitolo', of: 'del capitolo', to: 'al capitolo', one: 'capitolo', many: 'capitoli', seen: 'letti', seenLabel: 'Capitoli letti' },
};

let items = [];
let prefs = { view: 'corso', kind: 'tutti', sort: 'recenti', lastSync: 0 };

function readJSON(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function load() {
  items = readJSON(KEY, []);
  prefs = Object.assign(prefs, readJSON(PREFS, {}));
}
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
    localStorage.setItem(PREFS, JSON.stringify(prefs));
    return true;
  } catch (e) {
    toast('Memoria del browser piena: le ultime modifiche non sono salvate. Esporta un backup e togli qualche copertina.');
    return false;
  }
}

/* ---------- utilità ---------- */
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => (v === '' || v == null || isNaN(+v)) ? null : Math.max(0, Math.floor(+v));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const host = url => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };
const unit = it => UNIT[it.kind] || UNIT.anime;

function fill(tpl, n) {
  return tpl.replace(/\{n(?::(\d))?\}/g, (_, w) => String(n).padStart(+w || 0, '0'));
}
function nextOf(it) { return (it.seen || 0) + 1; }
function avail(it) { return it.released ?? it.total ?? null; }
function remaining(it) { const a = avail(it); return a == null ? null : Math.max(0, a - (it.seen || 0)); }
function isDone(it) { return it.total != null && (it.seen || 0) >= it.total; }
function urlOf(it) {
  if (!it.link) return '';
  return it.mode === 'tpl' ? fill(it.link, nextOf(it)) : it.link;
}

/* analisi di un link: trova i numeri dopo il dominio e indovina quale è l'episodio */
function analyze(url) {
  const out = { url, nums: [], pick: -1, tpl: false };
  if (!url) return out;
  if (/\{n(?::\d)?\}/.test(url)) { out.tpl = true; return out; }
  let start = 0;
  try { const u = new URL(url); start = url.indexOf(u.host) + u.host.length; } catch { return out; }
  const rest = url.slice(start);
  for (const m of rest.matchAll(/\d+/g)) out.nums.push({ str: m[0], value: +m[0], at: start + m.index });
  if (!out.nums.length) return out;
  out.pick = out.nums.length - 1;
  for (let i = out.nums.length - 1; i >= 0; i--) {
    const before = url.slice(Math.max(0, out.nums[i].at - 12), out.nums[i].at).toLowerCase();
    if (/(episod[ei]o?|episode|ep|chapter|capitolo|cap|ch)[-_/ .]*$/.test(before)) { out.pick = i; break; }
  }
  return out;
}
function makeTemplate(url, n) {
  const w = n.str.length > 1 && n.str[0] === '0' ? `:${n.str.length}` : '';
  return url.slice(0, n.at) + `{n${w}}` + url.slice(n.at + n.str.length);
}
function guessTitle(url) {
  try {
    const segs = new URL(url).pathname.split('/').filter(s => /[a-z]/i.test(s) && s.includes('-'));
    if (!segs.length) return '';
    let s = segs.sort((a, b) => b.length - a.length)[0];
    s = s.replace(/^\d+-/, '');
    s = s.split(/-(?:episod[ei]o?|episode|ep|chapter|capitolo|ch|streaming|english|sub|vol)(?:-|_|\d|$)/i)[0];
    s = s.replace(/-[a-z0-9]{0,6}\d[a-z0-9]*$/i, '').replace(/-manga$/i, '');
    return s.split('-').filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
  } catch { return ''; }
}
function guessKind(url) {
  return /chapter|capitolo|manga|\/ch_|ch-\d|scans/i.test(url) ? 'manga' : null;
}

/* ---------- rendering ---------- */
const main = $('#main');
const fmtDay = new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });

function ticksHTML(it) {
  const n = it.total ?? it.released;
  if (!n) return '';
  const seen = Math.min(it.seen || 0, n), rel = Math.min(it.released ?? it.total ?? 0, n);
  if (n <= 30) {
    let h = '';
    for (let i = 1; i <= n; i++) h += `<i class="${i <= seen ? 'v' : i <= rel ? 'u' : ''}"></i>`;
    return `<div class="ticks" aria-hidden="true">${h}</div>`;
  }
  const p = x => (x / n * 100).toFixed(2) + '%';
  return `<div class="ticks bar" aria-hidden="true"><i class="v" style="width:${p(seen)}"></i><i class="u" style="width:${p(Math.max(0, rel - seen))}"></i><i style="flex:1"></i></div>`;
}

function metaHTML(it) {
  const u = unit(it), seen = it.seen || 0, rem = remaining(it);
  if (isDone(it)) return `<p class="meta">${it.total === 1 ? 'Visto' : `Tutti e ${it.total} ${u.seen}`}</p>`;
  let s = it.total != null ? `${seen} di ${it.total} ${u.seen}` : `${seen} ${u.seen}`;
  if (it.released != null && rem > 0 && (it.total == null || it.released < it.total)) s += ` · <b>${rem} da vedere</b>`;
  else if (rem === 0 && it.next?.at && it.next.ep === seen + 1) s += ` · ${u.short} ${it.next.ep} ${fmtDay.format(new Date(it.next.at * 1000))}`;
  return `<p class="meta">${s}</p>`;
}

function siteHTML(it) {
  if (!it.link) return `<p class="site">Senza link</p>`;
  const h = esc(host(it.link.replace(/\{n(:\d)?\}/g, '1')));
  if (it.mode !== 'tpl' && it.linkEp != null && it.linkEp !== nextOf(it))
    return `<p class="site stale" title="Il link fisso porta ${unit(it).to} ${it.linkEp}">${h} · link al ${it.linkEp}</p>`;
  return `<p class="site">${h}</p>`;
}

function cardHTML(it, small) {
  const u = unit(it), next = nextOf(it), done = isDone(it), rem = remaining(it);
  const url = urlOf(it);
  const img = it.cover
    ? `<img src="${esc(it.cover)}" alt="" loading="lazy" referrerpolicy="no-referrer">`
    : `<div class="ph" style="background:${esc(it.color || '#2c3039')}">${esc(it.title)}</div>`;
  const label = done ? 'Completato' : `${u.short} ${next}`;
  const sub = !url ? '<small>Aggiungi il link</small>' : '';
  const count = !done && rem > 0 && it.status === 'corso' ? `<span class="count" title="${rem} da vedere">${rem}</span>` : '';
  const inner = `${img}${count}<span class="next">${label}${sub}</span>`;
  const cover = url && !done
    ? `<a class="cover" href="${esc(url)}" target="_blank" rel="noreferrer" data-open aria-label="Apri ${esc(it.title)}, ${u.one} ${next}">${inner}</a>`
    : `<button type="button" class="cover" data-edit style="padding:0;width:100%;min-height:0;text-align:left" aria-label="Modifica ${esc(it.title)}">${inner}</button>`;
  let action;
  if (it.status !== 'corso') action = `<button class="seen" data-resume>Riprendi</button>`;
  else if (done) action = `<button class="seen" data-archive>Archivia</button>`;
  else action = `<button class="seen${it.opened === next ? ' ring' : ''}" data-seen aria-label="Segna ${it.kind === 'manga' ? 'letto' : 'visto'} ${u.one} ${next}">${it.kind === 'manga' ? 'Letto' : 'Visto'}</button>`;
  return `<article class="card${done ? ' done' : ''}${small ? ' small' : ''}" data-id="${it.id}">
    ${cover}
    <h3>${esc(it.title)}</h3>
    ${ticksHTML(it)}${metaHTML(it)}${siteHTML(it)}
    <div class="actions">${action}<button class="edit" data-edit aria-label="Modifica ${esc(it.title)}"><svg viewBox="0 0 24 24" width="18" height="18" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg></button></div>
  </article>`;
}

function sorted(list) {
  const by = {
    recenti: (a, b) => (b.touched || 0) - (a.touched || 0),
    davedere: (a, b) => (remaining(b) ?? -1) - (remaining(a) ?? -1) || (b.touched || 0) - (a.touched || 0),
    titolo: (a, b) => a.title.localeCompare(b.title, 'it'),
  }[prefs.sort];
  return [...list].sort(by);
}

function render() {
  const inView = it => prefs.view === 'corso' ? it.status === 'corso' : it.status !== 'corso';
  const viewItems = items.filter(inView);
  document.querySelectorAll('.views button').forEach(b => {
    b.setAttribute('aria-selected', b.dataset.view === prefs.view);
    b.querySelector('.n').textContent = items.filter(it => b.dataset.view === 'corso' ? it.status === 'corso' : it.status !== 'corso').length;
  });
  document.querySelectorAll('.kinds button').forEach(b => {
    const k = b.dataset.kind;
    const c = k === 'tutti' ? viewItems.length : viewItems.filter(it => it.kind === k).length;
    b.querySelector('.n').textContent = c;
    b.setAttribute('aria-pressed', k === prefs.kind);
    b.disabled = c === 0 && k !== 'tutti' && k !== prefs.kind;
  });
  $('#sortSel').value = prefs.sort;
  const list = sorted(viewItems.filter(it => prefs.kind === 'tutti' || it.kind === prefs.kind));

  if (prefs.view === 'corso') {
    if (!list.length) {
      main.innerHTML = `<div class="empty"><p>${items.length ? 'Nessun titolo in corso con questo filtro.' : 'Qui compariranno le serie che stai seguendo, con il prossimo episodio da vedere.'}</p><button class="primary" data-add>Aggiungi titolo</button></div>`;
      return;
    }
    main.innerHTML = `<div class="grid">${list.map(it => cardHTML(it)).join('')}</div>`;
  } else {
    const fin = list.filter(it => it.status === 'finito'), drop = list.filter(it => it.status === 'droppato');
    if (!list.length) { main.innerHTML = `<div class="empty"><p>Qui finiscono i titoli finiti e quelli lasciati a metà. Si archiviano dal tasto Modifica, alla voce Stato.</p></div>`; return; }
    main.innerHTML =
      (fin.length ? `<h2 class="section-title">Finiti · ${fin.length}</h2><div class="grid small">${fin.map(it => cardHTML(it, true)).join('')}</div>` : '') +
      (drop.length ? `<h2 class="section-title">Droppati · ${drop.length}</h2><div class="grid small">${drop.map(it => cardHTML(it, true)).join('')}</div>` : '');
  }
}

/* ---------- azioni sulle card ---------- */
const byId = id => items.find(it => it.id === id);

main.addEventListener('click', e => {
  const t = e.target.closest('[data-open],[data-seen],[data-edit],[data-archive],[data-resume],[data-add]');
  if (!t) return;
  if (t.hasAttribute('data-add')) return openEditor(null);
  const it = byId(t.closest('.card').dataset.id);
  if (!it) return;
  if (t.hasAttribute('data-open')) {
    it.opened = nextOf(it); it.touched = Date.now(); save();
    setTimeout(render, 300);
    return; // il link si apre da solo
  }
  if (t.hasAttribute('data-edit')) return openEditor(it);
  if (t.hasAttribute('data-seen')) {
    const before = { seen: it.seen, opened: it.opened, touched: it.touched };
    it.seen = (it.seen || 0) + 1; it.opened = null; it.touched = Date.now();
    save(); render();
    toast(`${it.title}: ${unit(it).seen.slice(0, -1)}o ${unit(it).short.toLowerCase()} ${it.seen}`, () => { Object.assign(it, before); save(); render(); });
    return;
  }
  if (t.hasAttribute('data-archive') || t.hasAttribute('data-resume')) {
    const prev = it.status;
    it.status = t.hasAttribute('data-archive') ? 'finito' : 'corso';
    it.touched = Date.now(); save(); render();
    toast(it.status === 'finito' ? `${it.title} spostato tra i finiti` : `${it.title} di nuovo in corso`, () => { it.status = prev; save(); render(); });
  }
});

document.querySelector('.views').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  prefs.view = b.dataset.view; prefs.kind = 'tutti'; save(); render();
});
document.querySelector('.kinds').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  prefs.kind = b.dataset.kind; save(); render();
});
$('#sortSel').addEventListener('change', e => { prefs.sort = e.target.value; save(); render(); });
$('#addBtn').addEventListener('click', () => openEditor(null));
document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });

/* ---------- toast ---------- */
let toastTimer;
function toast(msg, undo) {
  const el = $('#toast'), btn = $('button', el);
  $('span', el).textContent = msg;
  btn.hidden = !undo;
  btn.onclick = () => { el.hidden = true; undo && undo(); };
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, undo ? 6000 : 4000);
}

/* ---------- editor ---------- */
const dlg = $('#editor'), form = $('#form');
const F = form.elements;
let ed = null; // { item, an, mode, seenTouched }

function openEditor(it) {
  const isNew = !it;
  const base = it ? { ...it } : { id: uid(), title: '', kind: prefs.kind !== 'tutti' ? prefs.kind : 'anime', status: 'corso', seen: 0, released: null, total: null, link: '', mode: 'fixed', linkEp: null, cover: '', created: Date.now() };
  ed = { item: base, isNew, seenTouched: !isNew, mode: base.mode || 'fixed' };
  $('#edTitle').textContent = isNew ? 'Nuovo titolo' : base.title;
  $('#delBtn').hidden = isNew;
  F.title.value = base.title;
  F.kind.value = base.kind;
  F.status.value = base.status;
  F.seen.value = base.seen || 0;
  F.released.value = base.released ?? '';
  F.total.value = base.total ?? '';
  F.cover.value = base.cover?.startsWith('data:') ? '' : (base.cover || '');
  F.cover.placeholder = base.cover?.startsWith('data:') ? 'Copertina salvata (incolla un link per cambiarla)' : "Link di un'immagine";
  $('#results').hidden = true; $('#results').innerHTML = '';
  // link: per i modelli mostro il link del prossimo episodio
  let shown = base.link || '';
  ed.forcePickAt = null;
  if (base.mode === 'tpl' && shown) { ed.forcePickAt = shown.search(/\{n/); shown = fill(shown, nextOf(base)); }
  F.link.value = shown;
  updateKindLabels();
  analyzeLink(false);
  updateCoverPrev();
  dlg.showModal();
  if (isNew) F.link.focus();
}

function updateKindLabels() {
  $('#seenLabel').textContent = UNIT[F.kind.value].seenLabel;
}
function updateCoverPrev() {
  const src = F.cover.value.trim() || ed.item.cover || '';
  const img = $('#coverPrev');
  img.hidden = !src; if (src) img.src = src;
}

function analyzeLink(fromInput) {
  const url = F.link.value.trim();
  const an = analyze(url);
  if (ed.forcePickAt != null) {
    const i = an.nums.findIndex(n => n.at === ed.forcePickAt);
    if (i >= 0) an.pick = i;
    ed.forcePickAt = null;
  }
  ed.an = an;
  if (fromInput) {
    ed.mode = an.nums.length && !FIXED_HOSTS.test(url) ? 'tpl' : 'fixed';
    if (ed.isNew) {
      if (!F.title.value.trim()) F.title.value = guessTitle(url);
      const k = guessKind(url); if (k) F.kind.value = k;
      updateKindLabels();
      if (!ed.seenTouched && an.pick >= 0) F.seen.value = Math.max(0, an.nums[an.pick].value - 1);
    }
  }
  if (an.tpl) ed.mode = 'tpl';
  renderLinkInfo();
}

function renderLinkInfo() {
  const box = $('#linkInfo'), an = ed.an, u = UNIT[F.kind.value];
  if (!an.url) { box.innerHTML = ''; return; }
  if (an.tpl) { box.innerHTML = `<span>Il link segue ${u.the}: <code>{n}</code> viene sostituito dal numero.</span>`; return; }
  if (!an.nums.length) { box.innerHTML = `<span>Nessun numero nel link: si aprirà sempre questa pagina.</span>`; ed.mode = 'fixed'; return; }
  const n = an.nums[an.pick];
  const next = (num(F.seen.value) || 0) + 1;
  const chips = an.nums.length > 1
    ? `<div class="chips"><span>Numero ${u.of} nel link:</span>${an.nums.map((x, i) => `<button type="button" data-pick="${i}" aria-pressed="${i === an.pick}">${esc(x.str)}</button>`).join('')}</div>` : '';
  const modes = `<div class="chips">
      <button type="button" data-mode="tpl" aria-pressed="${ed.mode === 'tpl'}">Il link segue ${u.the}</button>
      <button type="button" data-mode="fixed" aria-pressed="${ed.mode === 'fixed'}">Link fisso</button></div>`;
  const hint = ed.mode === 'tpl'
    ? `<span>Dopo ogni ${u.one} visto, il numero ${esc(n.str)} nel link diventa quello del prossimo.</span>`
    : `<span class="${FIXED_HOSTS.test(an.url) ? '' : 'warn'}">${FIXED_HOSTS.test(an.url) ? 'Su questo sito ogni ' + u.one + ' ha un codice suo: il link resta questo finché non ne incolli uno nuovo.' : 'Il link resta questo finché non ne incolli uno nuovo.'}</span>`;
  const setNext = n.value !== next
    ? `<div class="chips"><button type="button" data-setnext="${n.value}">Prossimo da vedere: ${u.short.toLowerCase()} ${n.value}</button><span>ora è il ${next}</span></div>` : '';
  box.innerHTML = chips + modes + hint + setNext;
}

$('#linkInfo').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.pick) { ed.an.pick = +b.dataset.pick; }
  if (b.dataset.mode) { ed.mode = b.dataset.mode; }
  if (b.dataset.setnext) { F.seen.value = Math.max(0, +b.dataset.setnext - 1); ed.seenTouched = true; }
  renderLinkInfo();
});
F.link.addEventListener('input', () => analyzeLink(true));
F.seen.addEventListener('input', () => { ed.seenTouched = true; renderLinkInfo(); });
$('#kindSeg').addEventListener('change', () => { updateKindLabels(); renderLinkInfo(); });
F.cover.addEventListener('input', updateCoverPrev);
document.querySelector('.stepper').addEventListener('click', e => {
  const b = e.target.closest('[data-step]'); if (!b) return;
  F.seen.value = Math.max(0, (num(F.seen.value) || 0) + +b.dataset.step);
  ed.seenTouched = true; renderLinkInfo();
});
$('#cancelBtn').addEventListener('click', () => dlg.close());

$('#delBtn').addEventListener('click', () => {
  const it = ed.item;
  if (!confirm(`Elimina «${it.title}» dal catalogo? Si perdono anche gli episodi segnati. Se l'hai solo finito o lasciato, conviene archiviarlo.`)) return;
  const idx = items.findIndex(x => x.id === it.id);
  if (idx < 0) return dlg.close();
  const [removed] = items.splice(idx, 1);
  save(); dlg.close(); render();
  toast(`${removed.title} eliminato`, () => { items.splice(idx, 0, removed); save(); render(); });
});

form.addEventListener('submit', e => {
  e.preventDefault();
  const it = ed.item;
  const title = F.title.value.trim();
  if (!title) { F.title.focus(); return; }
  it.title = title;
  it.kind = F.kind.value;
  it.seen = num(F.seen.value) || 0;
  it.released = num(F.released.value);
  it.total = num(F.total.value);
  if (it.total != null && it.released != null && it.released > it.total) it.total = it.released;
  const coverIn = F.cover.value.trim();
  if (coverIn) it.cover = coverIn;
  const prevStatus = it.status;
  it.status = F.status.value;
  const an = ed.an, url = F.link.value.trim();
  if (!url) { it.link = ''; it.mode = 'fixed'; it.linkEp = null; }
  else if (an.tpl) { it.link = url; it.mode = 'tpl'; it.linkEp = null; }
  else if (ed.mode === 'tpl' && an.pick >= 0) { it.link = makeTemplate(url, an.nums[an.pick]); it.mode = 'tpl'; it.linkEp = null; }
  else { it.link = url; it.mode = 'fixed'; it.linkEp = an.pick >= 0 ? an.nums[an.pick].value : null; }
  it.touched = Date.now();
  if (ed.isNew) items.push(it); else Object.assign(byId(it.id), it);
  if (!save()) return;
  dlg.close();
  if (it.status !== prevStatus && !ed.isNew) prefs.view = it.status === 'corso' ? 'corso' : prefs.view;
  render();
});

/* ---------- ricerca copertine: AniList per anime e manga, TVmaze per le serie ---------- */
async function anilist(query, variables) {
  const r = await fetch('https://graphql.anilist.co', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(12000),
  });
  if (r.status === 429) throw new Error('limite');
  if (!r.ok) throw new Error('http ' + r.status);
  const d = await r.json();
  if (d.errors) throw new Error(d.errors[0].message);
  return d.data;
}
const MEDIA_FIELDS = 'id type format status episodes chapters seasonYear title{romaji english} coverImage{large color} nextAiringEpisode{episode airingAt}';

function fromMedia(m) {
  const total = m.type === 'MANGA' ? m.chapters : m.episodes;
  const out = { anilist: m.id, total: total ?? null, next: m.nextAiringEpisode ? { ep: m.nextAiringEpisode.episode, at: m.nextAiringEpisode.airingAt } : null };
  if (m.nextAiringEpisode) out.released = m.nextAiringEpisode.episode - 1;
  else if (m.status === 'FINISHED' && total != null) out.released = total;
  else out.released = undefined; // non lo so: lascio quello che c'è
  return out;
}

$('#searchBtn').addEventListener('click', search);
F.title.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); search(); } });

async function search() {
  const q = F.title.value.trim();
  const box = $('#results');
  if (!q) { F.title.focus(); return; }
  box.hidden = false; box.innerHTML = '<p>Ricerca in corso…</p>';
  const kind = F.kind.value;
  try {
    let res;
    if (kind === 'serie') {
      const r = await fetch('https://api.tvmaze.com/search/shows?q=' + encodeURIComponent(q), { signal: AbortSignal.timeout(12000) });
      if (!r.ok) throw new Error('http');
      res = (await r.json()).slice(0, 8).map(({ show: s }) => ({
        title: s.name, cover: s.image?.medium || '', sub: [s.premiered?.slice(0, 4), s.network?.name || s.webChannel?.name].filter(Boolean).join(' · '),
        apply: { cover: s.image?.medium || '', tvmaze: s.id },
      }));
    } else {
      const d = await anilist(`query($s:String,$t:MediaType){Page(perPage:10){media(search:$s,type:$t,isAdult:false){${MEDIA_FIELDS}}}}`, { s: q, t: kind === 'manga' ? 'MANGA' : 'ANIME' });
      res = d.Page.media.map(m => {
        const tot = m.type === 'MANGA' ? m.chapters : m.episodes;
        const u = m.type === 'MANGA' ? 'cap.' : 'ep.';
        return {
          title: m.title.english || m.title.romaji, cover: m.coverImage.large,
          sub: [m.seasonYear, m.format?.replace('_', ' ').toLowerCase().replace(/^tv$/, 'tv'), tot ? `${tot} ${u}` : (m.status === 'RELEASING' ? 'in uscita' : '')].filter(Boolean).join(' · '),
          apply: { cover: m.coverImage.large, color: m.coverImage.color, ...fromMedia(m) },
        };
      });
    }
    if (!res.length) { box.innerHTML = `<p>Nessun risultato per «${esc(q)}». Prova con il titolo originale o in inglese.</p>`; return; }
    box.innerHTML = res.map((r, i) => `<button type="button" class="res" data-i="${i}"><img src="${esc(r.cover)}" alt="" referrerpolicy="no-referrer"><span>${esc(r.title)}</span><small>${esc(r.sub)}</small></button>`).join('');
    box.onclick = e => {
      const b = e.target.closest('.res'); if (!b) return;
      const r = res[+b.dataset.i];
      F.title.value = r.title;
      const a = r.apply;
      ed.item.cover = a.cover; F.cover.value = a.cover;
      if (a.color) ed.item.color = a.color;
      if (a.anilist) { ed.item.anilist = a.anilist; ed.item.next = a.next; }
      if (a.tvmaze) ed.item.tvmaze = a.tvmaze;
      if (a.total !== undefined && a.total !== null) F.total.value = a.total;
      if (a.released !== undefined) F.released.value = a.released ?? '';
      updateCoverPrev();
      box.hidden = true;
    };
  } catch (err) {
    box.innerHTML = `<p>${err.message === 'limite' ? 'AniList ha ricevuto troppe richieste. Riprova fra un minuto.' : 'Ricerca non riuscita: controlla la connessione e riprova.'}</p>`;
  }
}

/* ---------- aggiornamento da AniList: episodi usciti e prossima uscita ---------- */
async function sync(manual) {
  const list = items.filter(it => it.anilist && it.status === 'corso');
  if (!list.length) { if (manual) toast('Nessun titolo collegato ad AniList. Usa Cerca copertina nella scheda per collegarlo.'); return; }
  try {
    const d = await anilist(`query($ids:[Int]){Page(perPage:50){media(id_in:$ids){${MEDIA_FIELDS}}}}`, { ids: list.map(it => it.anilist) });
    let changed = 0;
    for (const m of d.Page.media) {
      const f = fromMedia(m);
      for (const it of list.filter(x => x.anilist === m.id)) {
        const before = JSON.stringify([it.released, it.total, it.next]);
        if (f.total != null) it.total = f.total;
        if (f.released !== undefined) it.released = f.released;
        it.next = f.next;
        if (it.total != null && it.released != null && it.released > it.total) it.total = it.released;
        if (JSON.stringify([it.released, it.total, it.next]) !== before) changed++;
      }
    }
    prefs.lastSync = Date.now(); save(); render();
    if (manual) toast(changed ? `Aggiornati ${changed} ${changed === 1 ? 'titolo' : 'titoli'}` : 'Nessuna novità su AniList');
  } catch (err) {
    if (manual) toast(err.message === 'limite' ? 'AniList ha ricevuto troppe richieste. Riprova fra un minuto.' : 'AniList non risponde. I dati salvati restano, riprova più tardi.');
  }
}
$('#syncBtn').addEventListener('click', () => { $('.menu').open = false; sync(true); });

/* ---------- backup ---------- */
$('#exportBtn').addEventListener('click', () => {
  $('.menu').open = false;
  const blob = new Blob([JSON.stringify({ app: 'segnalibro', version: 1, saved: new Date().toISOString(), items }, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `segnalibro-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
});
$('#importInput').addEventListener('change', async e => {
  $('.menu').open = false;
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  try {
    const d = JSON.parse(await file.text());
    const list = Array.isArray(d) ? d : d.items;
    if (!Array.isArray(list) || !list.every(x => x && x.id && x.title)) throw new Error('formato');
    if (!confirm(`Il backup contiene ${list.length} titoli. Sostituisce il catalogo attuale (${items.length} titoli). Procedo?`)) return;
    const prev = items; items = list; save(); render();
    toast(`Catalogo sostituito: ${list.length} titoli`, () => { items = prev; save(); render(); });
  } catch {
    toast('File non riconosciuto: serve un backup esportato da Segnalibro.');
  }
});
document.addEventListener('click', e => { const m = $('.menu'); if (m.open && !m.contains(e.target)) m.open = false; });

/* ---------- avvio ---------- */
load();
render();
if (Date.now() - (prefs.lastSync || 0) > 6 * 3600e3) sync(false);
