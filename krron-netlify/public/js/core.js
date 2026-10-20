// Krron – Kernfunktionen: API, Hilfsfunktionen, Event-Delegation, Router.
export const state = { boot: null };

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch('/api' + path, {
    method,
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json', 'x-requested-with': 'krron' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* keine JSON-Antwort */ }
  if (!res.ok) {
    const e = new Error(data?.error || `Fehler (${res.status})`);
    e.status = res.status; e.data = data;
    throw e;
  }
  return data;
}

export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const nf = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const money = (n) => `${nf.format(Number(n) || 0)} $`;
export const date = (d) => (d ? new Date(d).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '–');
export const paragraphs = (t) => esc(t).split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
export const stars = (r) => '★'.repeat(Math.round(r)) + '☆'.repeat(5 - Math.round(r));
export function priceHtml(amount) {
  const [i, d] = nf.format(amount).split(',');
  return `<span class="p-main"><span class="p-int">${esc(i)}</span><span class="p-dec">,${esc(d)}</span><span class="p-cur">$</span></span>`;
}
export const finalPrice = (p) => (p.discount_percent > 0 ? Math.round(p.price * (1 - p.discount_percent / 100) * 100) / 100 : p.price);
/** Interner Link (/#/...) oder http(s) – nie javascript: */
export const safeHref = (u) => (/^https?:\/\//i.test(u) || /^\/(?!\/)/.test(u) ? esc(u) : '#');
export const imgSrc = (u) => (u ? esc(u) : '');
export const alert = (type, msg) => `<div class="alert alert-${type}">${esc(msg)}</div>`;
export const selected = (a, b) => (String(a) === String(b) ? ' selected' : '');
export const checked = (v) => (v ? ' checked' : '');

// ---------- Meldungen ----------
let pending = null;
export function flash(type, msg) { pending = { type, msg }; }
export function notify(type, msg) {
  const box = document.getElementById('flash');
  if (!box) return;
  box.innerHTML = alert(type, msg);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
export function takeFlash() { const f = pending; pending = null; return f ? alert(f.type, f.msg) : ''; }

// ---------- Event-Delegation ----------
const clicks = {}, submits = {}, changes = {};
export const onClick = (n, f) => { clicks[n] = f; };
export const onSubmit = (n, f) => { submits[n] = f; };
export const onChange = (n, f) => { changes[n] = f; };
async function run(p) {
  try { await p; } catch (e) {
    if (e.status === 401) { go('#/login'); return; }
    if (e.data?.code === 'force_pw') { go('#/change-password'); return; }
    notify('error', e.message || 'Unbekannter Fehler');
  }
}
export function formData(form) {
  const o = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    if (el.type === 'checkbox') { if (form.querySelectorAll(`[name="${el.name}"]`).length > 1) (o[el.name] ||= []).push(...(el.checked ? [el.value] : [])); else o[el.name] = el.checked; }
    else if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; }
    else o[el.name] = el.value;
  }
  return o;
}
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-click]');
  if (!el || !clicks[el.dataset.click]) return;
  e.preventDefault();
  run(clicks[el.dataset.click](el, e));
});
document.addEventListener('submit', (e) => {
  const f = e.target.closest('[data-submit]');
  if (!f || !submits[f.dataset.submit]) return;
  e.preventDefault();
  const btn = f.querySelector('button[type=submit]');
  if (btn) btn.disabled = true;
  run(Promise.resolve(submits[f.dataset.submit](f, formData(f), e)).finally(() => { if (btn) btn.disabled = false; }));
});
document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-change]');
  if (el && changes[el.dataset.change]) run(changes[el.dataset.change](el, e));
});

// ---------- Router ----------
const routes = [];
export const route = (pattern, handler, opts = {}) => {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:([a-z]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ re, keys, handler, opts });
};
export const go = (hash) => { if (location.hash === hash) render(); else location.hash = hash; };
export const hasPerm = (p) => !!state.boot?.user?.permissions?.includes(p);

let shellFn = null;
export const setShell = (f) => { shellFn = f; };
export async function refreshBoot() { state.boot = await api('/bootstrap'); }

let token = 0;
export async function render() {
  const my = ++token;
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs = ''] = raw.split('?');
  const query = Object.fromEntries(new URLSearchParams(qs));
  const u = state.boot?.user;
  let target = routes.find((r) => r.re.test(path));
  const ctxBase = { query, path };
  if (u?.force_password_change && path !== '/change-password') { go('#/change-password'); return; }
  if (!target) target = { handler: async () => ({ html: '<div class="card empty"><h2>Seite nicht gefunden</h2><a href="#/">Zur Startseite</a></div>' }), keys: [], re: /.*/, opts: {} };
  if (target.opts.auth && !u) { flash('info', 'Bitte melde dich an, um fortzufahren.'); go('#/login'); return; }
  if (target.opts.perm && !hasPerm(target.opts.perm)) { target = { handler: async () => ({ html: '<div class="card empty"><h2>Kein Zugriff</h2></div>' }), keys: [], re: /.*/, opts: {} }; }
  const m = target.re.exec(path) || [];
  const params = {};
  target.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
  let result;
  try {
    result = await target.handler({ ...ctxBase, params });
  } catch (e) {
    if (my !== token) return;
    if (e.status === 401) { flash('info', 'Bitte melde dich an.'); go('#/login'); return; }
    result = { html: alert('error', e.message || 'Fehler beim Laden.') };
  }
  if (my !== token) return;
  if (result.redirect) { go(result.redirect); return; }
  document.getElementById('app').innerHTML = shellFn(result);
  document.title = (result.title ? result.title + ' – ' : '') + (state.boot?.settings?.shop_name || 'Krron');
  window.scrollTo(0, 0);
  result.after?.();
}
window.addEventListener('hashchange', render);

// ---------- Bild-Upload (verkleinert große Bilder im Browser) ----------
export async function uploadImage(file) {
  if (!/^image\/(jpeg|png|gif|webp)$/.test(file.type)) throw new Error('Nur JPG, PNG, GIF oder WEBP.');
  let blob = file;
  if (file.size > 1.5 * 1024 * 1024 && file.type !== 'image/gif') {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
  }
  if (blob.size > 3.4 * 1024 * 1024) throw new Error('Das Bild ist zu groß (max. 3,5 MB).');
  const data = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(blob); });
  return (await api('/admin/upload', { method: 'POST', body: { data } })).path;
}
