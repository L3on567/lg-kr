// Krron – Adminpanel
import {
  state, api, esc, money, date, alert, selected, checked, flash, notify, takeFlash, onClick, onSubmit, onChange,
  route, go, refreshBoot, render, uploadImage,
} from './core.js';

export const ADMIN_MENU = [
  ['/admin', 'Dashboard', 'admin.access'], ['/admin/users', 'Nutzer', 'users.manage'], ['/admin/roles', 'Rollen & Rechte', 'roles.manage'],
  ['/admin/orders', 'Bestellungen', 'orders.view'], ['/admin/products', 'Produkte', 'products.manage'],
  ['/admin/categories', 'Kategorien', 'categories.manage'], ['/admin/coupons', 'Gutscheine & Rabatte', 'coupons.manage'],
  ['/admin/ui', 'UI-Editor', 'settings.manage'], ['/admin/settings', 'Einstellungen', 'settings.manage'],
];
const page = (title, active, body) => ({ admin: true, active, title, html: `<h1>${esc(title)}</h1><div id="flash">${takeFlash()}</div>${body}` });
const tag = (cls, t) => `<span class="tag ${cls}">${esc(t)}</span>`;
const orderTag = (s, l) => tag({ delivered: 'tag-green', cancelled: 'tag-red', express: 'tag-orange' }[s] || '', l);
const field = (label, name, value = '', o = {}) => `<div><label for="f_${name}">${esc(label)}</label>${o.area
  ? `<textarea id="f_${name}" name="${name}" rows="${o.rows || 3}" ${o.max ? `maxlength="${o.max}"` : ''}>${esc(value)}</textarea>`
  : `<input id="f_${name}" name="${name}" type="${o.type || 'text'}" value="${esc(value)}" ${o.attrs || ''}>`}</div>`;
const sel = (label, name, options, value) => `<div><label for="f_${name}">${esc(label)}</label><select id="f_${name}" name="${name}">${options.map(([v, t]) => `<option value="${esc(v)}"${selected(v, value)}>${esc(t)}</option>`).join('')}</select></div>`;
const check = (label, name, v) => `<label class="check"><input type="checkbox" name="${name}"${checked(v)}> ${esc(label)}</label>`;
const toLocal = (d) => (d ? new Date(new Date(d).getTime() - new Date(d).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');
const otpBox = (email, pw, what) => `<div class="alert alert-success">${what}<br>E-Mail: <strong>${esc(email)}</strong><code class="otp">${esc(pw)}</code>
  <span class="small">Das Passwort wird nur jetzt angezeigt. Der Nutzer muss es beim ersten Login ändern.</span></div>`;

function uploadBox(name, value, hint = '') {
  return `<div class="upload-box" data-upbox><img src="${esc(value)}" alt="" ${value ? '' : 'hidden'}>
    <div><input type="hidden" name="${name}" value="${esc(value)}"><input type="file" accept="image/jpeg,image/png,image/gif,image/webp" data-change="upload">
    <p class="muted small">JPG, PNG, GIF oder WEBP. Große Bilder werden automatisch verkleinert. ${esc(hint)}</p>
    <button type="button" class="btn btn-secondary btn-sm" data-click="upload-clear">Bild entfernen</button></div></div>`;
}
onChange('upload', async (el) => {
  const file = el.files[0]; if (!file) return;
  const box = el.closest('[data-upbox]');
  const path = await uploadImage(file);
  box.querySelector('input[type=hidden]').value = path;
  const img = box.querySelector('img'); img.src = path; img.hidden = false;
  el.value = '';
});
onClick('upload-clear', (el) => { const box = el.closest('[data-upbox]'); box.querySelector('input[type=hidden]').value = ''; box.querySelector('img').hidden = true; });

async function done(msg, to) { flash('success', msg); if (to) go(to); else render(); }
const confirmDel = (m = 'Wirklich löschen?') => confirm(m);

// ---------- Dashboard ----------
route('/admin', async () => {
  const s = await api('/admin/stats');
  return page('Dashboard', '/admin', `<div class="stat-grid"><div class="stat"><strong>${s.open_orders}</strong><span>Offene Bestellungen</span></div>
    <div class="stat"><strong>${money(s.revenue)}</strong><span>Umsatz (ohne Stornos)</span></div><div class="stat"><strong>${s.products}</strong><span>Produkte</span></div>
    <div class="stat"><strong>${s.users}</strong><span>Nutzer</span></div></div>
    <div class="panel"><h2>Niedriger Lagerbestand</h2>${s.low_stock.length ? `<table class="data"><tbody>${s.low_stock.map((p) => `<tr><td><a href="#/admin/products/${p.id}">${esc(p.title)}</a></td><td>${p.stock} Stk.</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Alles ausreichend vorrätig.</p>'}</div>`);
}, { perm: 'admin.access' });

// ---------- Nutzer ----------
route('/admin/users', async ({ query }) => {
  const d = await api('/admin/users?q=' + encodeURIComponent(query.q || ''));
  return page('Nutzer', '/admin/users', `<div class="panel"><h2>Neues Konto anlegen</h2><div id="otp"></div>
    <form data-submit="user-create"><div class="form-row">${field('E-Mail', 'email', '', { type: 'email', attrs: 'required' })}${field('Telefonnummer', 'phone')}${field('Anzeigename (optional)', 'display_name')}
      ${sel('Rolle', 'role_id', d.roles.map((r) => [r.id, r.name]), 2)}</div>${field('Notizen für Fahrer / Lieferanten', 'driver_notes', '', { area: true })}
      <p class="muted small">Ein sicheres Zufallspasswort wird erzeugt. Beim ersten Login muss der Nutzer es ändern.</p><button class="btn" type="submit">Konto anlegen</button></form></div>
    <div class="panel"><form data-submit="user-search" class="actions"><input type="text" name="q" value="${esc(query.q || '')}" placeholder="Suche: E-Mail, Telefon, Name" style="max-width:340px"><button class="btn btn-secondary" type="submit">Suchen</button></form>
    <div class="table-wrap"><table class="data"><thead><tr><th>E-Mail</th><th>Telefon</th><th>Rolle</th><th>Guthaben</th><th>Status</th><th></th></tr></thead><tbody>
    ${d.users.map((u) => `<tr><td>${esc(u.email)}</td><td>${esc(u.phone || '')}</td><td>${esc(u.role_name)}</td><td>${money(u.balance)}</td>
      <td>${u.is_banned ? tag('tag-red', 'Gesperrt') : u.force_password_change ? tag('tag-orange', 'Erstes Login offen') : tag('tag-green', 'Aktiv')}</td>
      <td><a class="btn btn-secondary btn-sm" href="#/admin/users/${u.id}">Bearbeiten</a></td></tr>`).join('') || '<tr><td colspan="6" class="muted">Keine Nutzer.</td></tr>'}</tbody></table></div></div>`);
}, { perm: 'users.manage' });
onSubmit('user-search', (f, d) => go('#/admin/users' + (d.q ? '?q=' + encodeURIComponent(d.q) : '')));
onSubmit('user-create', async (f, d) => {
  const r = await api('/admin/users', { method: 'POST', body: { ...d, role_id: Number(d.role_id) } });
  await render();   // Liste aktualisieren, danach das Einmalpasswort wieder anzeigen
  document.getElementById('otp').innerHTML = otpBox(r.email, r.password, 'Konto angelegt.');
});

route('/admin/users/:id', async ({ params }) => {
  const d = await api('/admin/users/' + params.id), u = d.user;
  return page(`Nutzer: ${u.email}`, '/admin/users', `<p><a href="#/admin/users">‹ Alle Nutzer</a></p><div id="otp"></div>
    <div class="panel"><h2>Stammdaten</h2><form data-submit="user-save" data-id="${u.id}"><div class="form-row">${field('E-Mail', 'email', u.email, { type: 'email', attrs: 'required' })}${field('Telefonnummer', 'phone', u.phone || '')}
      ${field('Anzeigename', 'display_name', u.display_name || '')}${sel('Rolle', 'role_id', d.roles.map((r) => [r.id, r.name]), u.role_id)}</div><button class="btn" type="submit">Speichern</button></form>
      <p class="muted small">Zuletzt angemeldet: ${date(u.last_login_at)} · Angelegt: ${date(u.created_at)}</p>
      <button class="btn btn-secondary btn-sm" data-click="user-reset" data-id="${u.id}">Passwort zurücksetzen</button></div>
    <div class="panel"><h2>Guthaben: ${money(u.balance)}</h2><form data-submit="user-balance" data-id="${u.id}" class="form-row">${field('Betrag (+ aufladen / − abziehen)', 'amount', '', { attrs: 'required placeholder="z. B. 100 oder -25,50"' })}${field('Grund', 'reason')}
      <div style="align-self:end"><button class="btn" type="submit">Buchen</button></div></form>
      ${d.transactions.length ? `<table class="data"><tbody>${d.transactions.map((t) => `<tr><td>${date(t.created_at)}</td><td>${esc(t.reason)}</td><td>${t.amount >= 0 ? '+' : ''}${money(t.amount)}</td></tr>`).join('')}</tbody></table>` : ''}</div>
    <div class="panel"><h2>Sperre</h2>${u.is_banned ? `<div class="alert alert-error">Gesperrt. Begründung: ${esc(u.ban_reason)}</div>
      <button class="btn" data-click="user-unban" data-id="${u.id}">Entsperren</button>` : `<form data-submit="user-ban" data-id="${u.id}">
      ${field('Begründung (sieht der Nutzer beim Login)', 'reason', '', { area: true, max: 500 })}<button class="btn btn-danger" type="submit">Konto sperren</button></form>`}</div>
    <div class="panel"><h2>Fahrer-Notizen</h2>${d.notes.map((n) => `<div class="note">${esc(n.note)}<small>${date(n.created_at)}${n.order_id ? ` · Bestellung #${n.order_id}` : ''} · <a href="#" data-click="note-del" data-id="${n.id}">löschen</a></small></div>`).join('') || '<p class="muted">Keine Notizen.</p>'}
      <form data-submit="note-add" data-id="${u.id}">${field('Neue Notiz', 'note', '', { area: true })}<button class="btn btn-secondary" type="submit">Notiz speichern</button></form></div>`);
}, { perm: 'users.manage' });
onSubmit('user-save', async (f, d) => { await api('/admin/users/' + f.dataset.id, { method: 'PATCH', body: { ...d, role_id: Number(d.role_id) } }); await done('Gespeichert.'); });
onClick('user-reset', async (el) => {
  if (!confirmDel('Passwort wirklich zurücksetzen? Der Nutzer wird abgemeldet.')) return;
  const r = await api(`/admin/users/${el.dataset.id}/reset-password`, { method: 'POST', body: {} });
  document.getElementById('otp').innerHTML = otpBox(r.email, r.password, 'Neues Einmal-Passwort:');
  window.scrollTo(0, 0);
});
onSubmit('user-balance', async (f, d) => { await api(`/admin/users/${f.dataset.id}/balance`, { method: 'POST', body: d }); await done('Guthaben gebucht.'); });
onSubmit('user-ban', async (f, d) => { await api(`/admin/users/${f.dataset.id}/ban`, { method: 'POST', body: { banned: true, reason: d.reason } }); await done('Konto gesperrt.'); });
onClick('user-unban', async (el) => { await api(`/admin/users/${el.dataset.id}/ban`, { method: 'POST', body: { banned: false } }); await done('Konto entsperrt.'); });
onSubmit('note-add', async (f, d) => { await api(`/admin/users/${f.dataset.id}/notes`, { method: 'POST', body: d }); await done('Notiz gespeichert.'); });
onClick('note-del', async (el) => { await api('/admin/notes/' + el.dataset.id, { method: 'DELETE' }); render(); });

// ---------- Rollen ----------
route('/admin/roles', async () => {
  const d = await api('/admin/roles');
  const permBoxes = (sel2, disabled) => `<div class="perm-list">${d.permissions.map((p) => `<label><input type="checkbox" name="perms" value="${p.perm_key}"${checked(sel2.includes(p.perm_key))}${disabled ? ' disabled' : ''}><span><strong>${esc(p.perm_key)}</strong><br><span class="muted small">${esc(p.description)}</span></span></label>`).join('')}</div>`;
  return page('Rollen & Rechte', '/admin/roles', `${d.roles.map((r) => `<div class="panel"><h2>${esc(r.name)} ${r.is_system ? tag('', 'System') : ''} <span class="muted small">${r.users} Nutzer</span></h2>
    <form data-submit="role-save" data-id="${r.id}">${r.is_system ? '' : `<div class="form-row">${field('Name', 'name', r.name)}${field('Beschreibung', 'description', r.description || '')}</div>`}
    ${r.id === 1 ? '<p class="muted">Die Admin-Rolle hat immer alle Rechte.</p>' : `${r.is_system ? field('Beschreibung', 'description', r.description || '') : ''}${permBoxes(r.perms, false)}<div class="actions"><button class="btn" type="submit">Speichern</button>
    ${!r.is_system ? `<button type="button" class="btn btn-danger" data-click="role-del" data-id="${r.id}">Löschen</button>` : ''}</div>`}</form></div>`).join('')}
    <div class="panel"><h2>Neue Rolle</h2><form data-submit="role-create"><div class="form-row">${field('Name', 'name', '', { attrs: 'required' })}${field('Beschreibung', 'description')}</div>${permBoxes([], false)}<button class="btn" type="submit">Rolle anlegen</button></form></div>`);
}, { perm: 'roles.manage' });
const rolePayload = (d) => ({ ...d, perms: Array.isArray(d.perms) ? d.perms : [] });
onSubmit('role-save', async (f, d) => { await api('/admin/roles/' + f.dataset.id, { method: 'PATCH', body: rolePayload(d) }); await done('Rolle gespeichert.'); });
onSubmit('role-create', async (f, d) => { await api('/admin/roles', { method: 'POST', body: rolePayload(d) }); await done('Rolle angelegt.'); });
onClick('role-del', async (el) => { if (!confirmDel()) return; await api('/admin/roles/' + el.dataset.id, { method: 'DELETE' }); await done('Rolle gelöscht.'); });

// ---------- Bestellungen ----------
route('/admin/orders', async ({ query }) => {
  const d = await api(`/admin/orders?status=${encodeURIComponent(query.status || '')}&q=${encodeURIComponent(query.q || '')}`);
  return page('Bestellungen', '/admin/orders', `<div class="panel"><form data-submit="order-filter" class="actions">
    <select name="status" style="max-width:220px"><option value="">Alle Status</option>${Object.entries(d.statuses).map(([k, v]) => `<option value="${k}"${selected(query.status, k)}>${v}</option>`).join('')}</select>
    <input type="text" name="q" value="${esc(query.q || '')}" placeholder="E-Mail oder Bestell-Nr." style="max-width:260px"><button class="btn btn-secondary" type="submit">Filtern</button></form>
    <div class="table-wrap"><table class="data"><thead><tr><th>#</th><th>Datum</th><th>Kunde</th><th>Zone</th><th>Gesamt</th><th>Status</th><th></th></tr></thead><tbody>
    ${d.orders.map((o) => `<tr><td>${o.id}</td><td>${date(o.created_at)}</td><td>${esc(o.email)}</td><td>${esc(o.zone_name || '–')}</td><td>${money(o.total)}</td><td>${orderTag(o.status, o.status_label)}</td>
      <td><a class="btn btn-secondary btn-sm" href="#/admin/orders/${o.id}">Öffnen</a></td></tr>`).join('') || '<tr><td colspan="7" class="muted">Keine Bestellungen.</td></tr>'}</tbody></table></div></div>`);
}, { perm: 'orders.view' });
onSubmit('order-filter', (f, d) => go('#/admin/orders?' + new URLSearchParams(Object.fromEntries(Object.entries(d).filter(([, v]) => v)))));

route('/admin/orders/:id', async ({ params }) => {
  const d = await api('/admin/orders/' + params.id), o = d.order;
  const canManage = state.boot.user.permissions.includes('orders.manage');
  const open = !['cancelled', 'delivered'].includes(o.status);
  return page(`Bestellung #${o.id}`, '/admin/orders', `<p><a href="#/admin/orders">‹ Alle Bestellungen</a></p><div class="panel">
    <p>${orderTag(o.status, o.status_label)} · ${date(o.created_at)}</p>
    <p><strong>${esc(o.display_name || o.email)}</strong> · ${esc(o.email)} · ${esc(o.phone || 'keine Telefonnummer')}<br>Lieferort: ${esc(o.zone_name || '–')} · Adresse: ${esc(o.delivery_address)}<br>Zahlung: ${o.payment_method === 'balance' ? 'Krron-Guthaben' : 'Bar bei Lieferung'}${o.coupon_code ? ` · Gutschein ${esc(o.coupon_code)}` : ''}</p>
    <table class="data"><tbody>${d.items.map((i) => `<tr><td>${i.quantity} × ${esc(i.product_title)}</td><td>${money(i.unit_price * i.quantity)}</td></tr>`).join('')}
      <tr><td>Lieferung</td><td>${money(o.delivery_fee)}</td></tr>${o.discount_total > 0 ? `<tr><td>Gutschein</td><td>−${money(o.discount_total)}</td></tr>` : ''}<tr><th>Gesamt</th><th>${money(o.total)}</th></tr></tbody></table>
    ${o.cancel_reason ? `<div class="alert alert-error" style="margin-top:12px">Storniert (${o.cancelled_by === 'admin' ? 'Team' : 'Kunde'}): ${esc(o.cancel_reason)}</div>` : ''}</div>
    <div class="panel"><h2>Fahrer-Notizen</h2>${d.notes.map((n) => `<div class="note">${esc(n.note)}<small>${date(n.created_at)}</small></div>`).join('') || '<p class="muted">Keine Notizen.</p>'}</div>
    ${canManage && open ? `<div class="panel"><h2>Status ändern</h2><form data-submit="order-status" data-id="${o.id}">
      ${sel('Neuer Status', 'status', Object.entries(d.statuses).filter(([k]) => k !== 'cancelled'), o.status)}
      ${field('Nachricht an den Kunden (optional), z. B. „Fahrer ist unterwegs“', 'message', '', { max: 500 })}<button class="btn" type="submit">Status speichern</button></form></div>
    <div class="panel"><h2>Stornieren</h2><form data-submit="order-cancel" data-id="${o.id}">${field('Grund / Nachricht an den Kunden', 'reason', '', { area: true, max: 500 })}
      <p class="muted small">Lager, Guthaben und Gutschein werden automatisch zurückgebucht.</p><button class="btn btn-danger" type="submit">Bestellung stornieren</button></form></div>` : ''}
    <div class="panel"><h2>Verlauf / Nachrichten</h2>${d.messages.map((m) => `<div class="note"><small>${date(m.created_at)}${m.status ? ` · ${esc(d.statuses[m.status] || m.status)}` : ''}</small>${esc(m.message)}</div>`).join('') || '<p class="muted">Noch nichts.</p>'}</div>`);
}, { perm: 'orders.view' });
onSubmit('order-status', async (f, d) => { await api(`/admin/orders/${f.dataset.id}/status`, { method: 'POST', body: d }); await done('Status gespeichert.'); });
onSubmit('order-cancel', async (f, d) => { if (!confirm('Bestellung wirklich stornieren?')) return; await api(`/admin/orders/${f.dataset.id}/cancel`, { method: 'POST', body: d }); await done('Bestellung storniert.'); });

// ---------- Produkte ----------
route('/admin/products', async ({ query }) => {
  const d = await api('/admin/products?q=' + encodeURIComponent(query.q || ''));
  return page('Produkte', '/admin/products', `<div class="panel"><div class="actions"><a class="btn" href="#/admin/products/new">+ Neues Produkt</a>
    <form data-submit="product-search" class="actions"><input type="text" name="q" value="${esc(query.q || '')}" placeholder="Suche" style="max-width:260px"><button class="btn btn-secondary" type="submit">Suchen</button></form></div>
    <div class="table-wrap"><table class="data"><thead><tr><th></th><th>Titel</th><th>Kategorie</th><th>Preis</th><th>Bestand</th><th>Status</th><th></th></tr></thead><tbody>
    ${d.products.map((p) => `<tr><td>${p.image_url ? `<img src="${esc(p.image_url)}" alt="" style="width:44px;height:44px;object-fit:contain">` : '📦'}</td><td>${esc(p.title)}</td><td>${esc(p.category_name || '–')}</td><td>${money(p.price)}</td><td>${p.stock}</td>
      <td>${p.is_active ? tag('tag-green', 'Aktiv') : tag('', 'Versteckt')}</td><td class="actions"><a class="btn btn-secondary btn-sm" href="#/admin/products/${p.id}">Bearbeiten</a>
      <button class="btn btn-danger btn-sm" data-click="product-del" data-id="${p.id}">Löschen</button></td></tr>`).join('') || '<tr><td colspan="7" class="muted">Keine Produkte.</td></tr>'}</tbody></table></div></div>`);
}, { perm: 'products.manage' });
onSubmit('product-search', (f, d) => go('#/admin/products' + (d.q ? '?q=' + encodeURIComponent(d.q) : '')));
onClick('product-del', async (el) => { if (!confirmDel('Produkt wirklich löschen? Bestellungen bleiben erhalten.')) return; await api('/admin/products/' + el.dataset.id, { method: 'DELETE' }); await done('Produkt gelöscht.'); });
const productForm = (p, cats) => `<form data-submit="product-save" data-id="${p.id || ''}">
  <div class="form-row">${field('Titel', 'title', p.title || '', { attrs: 'required maxlength="190"' })}${sel('Kategorie', 'category_id', [['', '– keine –'], ...cats.map((c) => [c.id, c.name])], p.category_id ?? '')}
  ${field('Preis ($)', 'price', p.price ?? '', { attrs: 'required inputmode="decimal"' })}${field('Lagerbestand', 'stock', p.stock ?? 0, { type: 'number', attrs: 'min="0" required' })}</div>
  ${field('Beschreibung', 'description', p.description || '', { area: true, rows: 6 })}<label>Produktbild</label>${uploadBox('image_url', p.image_url || '')}
  ${check('Im Shop sichtbar', 'is_active', p.is_active !== false)}<button class="btn" type="submit">Speichern</button> <a class="btn btn-secondary" href="#/admin/products">Abbrechen</a></form>`;
route('/admin/products/new', async () => {
  const d = await api('/admin/products');
  return page('Neues Produkt', '/admin/products', `<div class="panel">${productForm({}, d.categories)}</div>`);
}, { perm: 'products.manage' });
route('/admin/products/:id', async ({ params }) => {
  const d = await api('/admin/products/' + params.id);
  return page('Produkt bearbeiten', '/admin/products', `<div class="panel">${productForm(d.product, d.categories)}</div>`);
}, { perm: 'products.manage' });
onSubmit('product-save', async (f, d) => {
  const id = f.dataset.id;
  await api(id ? '/admin/products/' + id : '/admin/products', { method: id ? 'PATCH' : 'POST', body: d });
  await done('Produkt gespeichert.', '#/admin/products');
});

// ---------- Kategorien ----------
route('/admin/categories', async () => {
  const d = await api('/admin/categories');
  return page('Kategorien', '/admin/categories', `<div class="panel"><h2>Neue Kategorie</h2><form data-submit="cat-save" class="form-row">${field('Name', 'name', '', { attrs: 'required' })}${field('Reihenfolge', 'sort_order', 0, { type: 'number' })}<div style="align-self:end"><button class="btn" type="submit">Anlegen</button></div></form></div>
    <div class="panel"><div class="table-wrap"><table class="data"><thead><tr><th>Name</th><th>Reihenfolge</th><th>Produkte</th><th></th></tr></thead><tbody>${d.categories.map((c) => `<tr><td colspan="4"><form data-submit="cat-save" data-id="${c.id}" class="actions">
      <input type="text" name="name" value="${esc(c.name)}" style="max-width:260px" required><input type="number" name="sort_order" value="${c.sort_order}" style="max-width:90px"><span class="muted">${c.products} Produkte</span>
      <button class="btn btn-secondary btn-sm" type="submit">Speichern</button><button type="button" class="btn btn-danger btn-sm" data-click="cat-del" data-id="${c.id}">Löschen</button></form></td></tr>`).join('')}</tbody></table></div></div>`);
}, { perm: 'categories.manage' });
onSubmit('cat-save', async (f, d) => { const id = f.dataset.id; await api(id ? '/admin/categories/' + id : '/admin/categories', { method: id ? 'PATCH' : 'POST', body: d }); await refreshBoot(); await done('Gespeichert.'); });
onClick('cat-del', async (el) => { if (!confirmDel('Kategorie löschen? Produkte bleiben ohne Kategorie bestehen.')) return; await api('/admin/categories/' + el.dataset.id, { method: 'DELETE' }); await refreshBoot(); await done('Gelöscht.'); });

// ---------- Gutscheine & Rabatte ----------
route('/admin/coupons', async () => {
  const d = await api('/admin/coupons');
  const catOpts = [['', '– alle –'], ...d.categories.map((c) => [c.id, c.name])], prodOpts = [['', '– alle –'], ...d.products.map((p) => [p.id, p.title])];
  return page('Gutscheine & Rabatte', '/admin/coupons', `<div class="panel"><h2>Gutscheincodes erzeugen</h2><div id="codes"></div>
    <form data-submit="coupon-create"><div class="form-row">${sel('Art', 'type', [['credit', 'Guthaben-Gutschein (Wert in $)'], ['percent', 'Prozent-Gutschein']], 'credit')}${field('Wert ($ bzw. %)', 'value', '', { attrs: 'required inputmode="decimal"' })}
      ${field('Anzahl Codes (nur Guthaben, max. 50)', 'count', 1, { type: 'number', attrs: 'min="1" max="50"' })}${field('Max. Einlösungen (nur Prozent)', 'max_uses', 1, { type: 'number', attrs: 'min="1"' })}
      ${sel('Nur Kategorie (nur Prozent)', 'category_id', catOpts, '')}${sel('Nur Produkt (nur Prozent)', 'product_id', prodOpts, '')}${field('Gültig bis (optional)', 'expires_at', '', { type: 'datetime-local' })}</div>
      <p class="muted small">Codes sind 12-stellig. Pro Bestellung ist ein Gutschein einlösbar.</p><button class="btn" type="submit">Erzeugen</button></form></div>
    <div class="panel"><h2>Gutscheine</h2><div class="table-wrap"><table class="data"><thead><tr><th>Code</th><th>Art</th><th>Wert</th><th>Geltung</th><th>Genutzt</th><th>Läuft ab</th><th></th></tr></thead><tbody>
    ${d.coupons.map((c) => `<tr><td><code>${esc(c.code)}</code></td><td>${c.type === 'credit' ? 'Guthaben' : 'Prozent'}</td><td>${c.type === 'credit' ? money(c.value) : c.value + ' %'}</td>
      <td>${esc(c.product_title || c.category_name || 'alles')}</td><td>${c.used_count}/${c.max_uses}</td><td>${date(c.expires_at)}</td><td class="actions">${c.is_active ? '' : tag('tag-red', 'inaktiv')}
      <button class="btn btn-secondary btn-sm" data-click="coupon-toggle" data-id="${c.id}" data-active="${c.is_active ? '' : '1'}">${c.is_active ? 'Deaktivieren' : 'Aktivieren'}</button>
      <button class="btn btn-danger btn-sm" data-click="coupon-del" data-id="${c.id}">Löschen</button></td></tr>`).join('') || '<tr><td colspan="7" class="muted">Noch keine Gutscheine.</td></tr>'}</tbody></table></div></div>
    <div class="panel"><h2>Rabattaktion anlegen</h2><form data-submit="discount-save"><div class="form-row">${field('Name', 'name', '', { attrs: 'required' })}${field('Rabatt (%)', 'percent', '', { attrs: 'required inputmode="decimal"' })}
      ${sel('Kategorie', 'category_id', catOpts.map(([v, t]) => [v, v === '' ? '– keine –' : t]), '')}${sel('oder Produkt', 'product_id', prodOpts.map(([v, t]) => [v, v === '' ? '– keins –' : t]), '')}
      ${field('Start (optional)', 'starts_at', '', { type: 'datetime-local' })}${field('Ende (optional)', 'ends_at', '', { type: 'datetime-local' })}</div><button class="btn" type="submit">Aktion anlegen</button></form></div>
    <div class="panel"><h2>Aktive Rabattaktionen</h2><div class="table-wrap"><table class="data"><thead><tr><th>Name</th><th>%</th><th>Gilt für</th><th>Zeitraum</th><th></th></tr></thead><tbody>
    ${d.discounts.map((x) => `<tr><td>${esc(x.name)}</td><td>${x.percent} %</td><td>${esc(x.product_title || x.category_name || '')}</td><td>${x.starts_at ? date(x.starts_at) : 'sofort'} – ${x.ends_at ? date(x.ends_at) : 'offen'}</td><td class="actions">
      <button class="btn btn-secondary btn-sm" data-click="discount-toggle" data-id="${x.id}" data-active="${x.is_active ? '' : '1'}">${x.is_active ? 'Pausieren' : 'Aktivieren'}</button>
      <button class="btn btn-danger btn-sm" data-click="discount-del" data-id="${x.id}">Löschen</button></td></tr>`).join('') || '<tr><td colspan="5" class="muted">Keine Aktionen.</td></tr>'}</tbody></table></div></div>`);
}, { perm: 'coupons.manage' });
onSubmit('coupon-create', async (f, d) => {
  const r = await api('/admin/coupons', { method: 'POST', body: { ...d, count: Number(d.count), max_uses: Number(d.max_uses) } });
  document.getElementById('codes').innerHTML = `<div class="alert alert-success">Erzeugt:<code class="otp">${r.codes.map(esc).join('\n')}</code></div>`;
  document.querySelector('#codes code').style.whiteSpace = 'pre';
});
onClick('coupon-toggle', async (el) => { await api('/admin/coupons/' + el.dataset.id, { method: 'PATCH', body: { is_active: !!el.dataset.active } }); render(); });
onClick('coupon-del', async (el) => { if (!confirmDel()) return; await api('/admin/coupons/' + el.dataset.id, { method: 'DELETE' }); render(); });
onSubmit('discount-save', async (f, d) => { await api('/admin/discounts', { method: 'POST', body: d }); await done('Rabattaktion angelegt.'); });
onClick('discount-toggle', async (el) => { await api('/admin/discounts/' + el.dataset.id, { method: 'PATCH', body: { is_active: !!el.dataset.active } }); render(); });
onClick('discount-del', async (el) => { if (!confirmDel()) return; await api('/admin/discounts/' + el.dataset.id, { method: 'DELETE' }); render(); });

// ---------- UI-Editor ----------
const PLACE_LABEL = { home_top: 'Startseite – oben', home_middle: 'Startseite – Mitte', home_bottom: 'Startseite – unten', product_side: 'Produktseite – Seitenleiste' };
const TYPE_LABEL = { hero: 'Hero-Slide (mehrere = Karussell, nur „oben")', ad: 'Werbebanner (Bild, klickbar)', tile: 'Kachel (Bild + Titel + Link)', text: 'Textbox (Ankündigung mit Button)' };
route('/admin/ui', async () => {
  const d = await api('/admin/blocks');
  return page('UI-Editor', '/admin/ui', `<p class="muted">Gestalte die Startseite und Produktseite: Werbung, Bilder, Kacheln und Textboxen – ohne Programmieren. Logo, Farben und Texte findest du unter „Einstellungen".</p>
    ${d.placements.map((pl) => { const list = d.blocks.filter((b) => b.placement === pl); return `<div class="panel"><div class="actions" style="justify-content:space-between"><h2 style="margin:0">${PLACE_LABEL[pl]}</h2><a class="btn btn-sm" href="#/admin/ui/new?placement=${pl}">+ Element hinzufügen</a></div>
      <div class="block-list">${list.map((b) => `<div class="block-row${b.is_active ? '' : ' is-off'}"><div class="block-thumb">${b.image_path ? `<img src="${esc(b.image_path)}" alt="">` : '<span></span>'}</div>
        <div class="block-info"><strong>${esc(b.title || '(ohne Titel)')}</strong><br><span class="muted small">${esc(TYPE_LABEL[b.type].split(' (')[0])} · Reihenfolge ${b.sort_order}${b.is_active ? '' : ' · ausgeblendet'}</span></div>
        <div class="block-actions actions"><a class="btn btn-secondary btn-sm" href="#/admin/ui/${b.id}">Bearbeiten</a><button class="btn btn-danger btn-sm" data-click="block-del" data-id="${b.id}">Löschen</button></div></div>`).join('') || '<p class="muted">Noch nichts – es wird der Standard angezeigt.</p>'}</div></div>`; }).join('')}`);
}, { perm: 'settings.manage' });
onClick('block-del', async (el) => { if (!confirmDel()) return; await api('/admin/blocks/' + el.dataset.id, { method: 'DELETE' }); render(); });
const blockForm = (b) => `<div class="editor-layout"><form data-submit="block-save" data-id="${b.id || ''}">
  <div class="form-row">${sel('Position', 'placement', Object.entries(PLACE_LABEL), b.placement)}${sel('Typ', 'type', Object.entries(TYPE_LABEL), b.type)}</div>
  <div class="form-row">${field('Titel', 'title', b.title || '')}${field('Untertitel', 'subtitle', b.subtitle || '')}</div>${field('Text (optional)', 'body', b.body || '', { area: true, rows: 4 })}
  <label>Bild</label>${uploadBox('image_path', b.image_path || '', 'Tipp: Banner ca. 1600×500 px.')}
  <div class="form-row">${field('Bild-Beschreibung (Alt-Text)', 'image_alt', b.image_alt || '')}${sel('Bild-Darstellung', 'image_fit', [['cover', 'Füllen (zuschneiden)'], ['contain', 'Einpassen (nichts abschneiden)']], b.image_fit)}</div>
  <div class="form-row">${field('Button-Text', 'button_text', b.button_text || '')}${field('Link (z. B. /#/search?cat=elektronik oder https://…)', 'link_url', b.link_url || '')}</div>
  <div class="form-row">${field('Hintergrundfarbe (#rrggbb, leer = Standard)', 'bg_color', b.bg_color || '', { attrs: 'maxlength="7" placeholder="#232f3e"' })}${field('Textfarbe (#rrggbb)', 'text_color', b.text_color || '', { attrs: 'maxlength="7"' })}
  ${field('Höhe in px (0 = automatisch)', 'height', b.height ?? 0, { type: 'number', attrs: 'min="0" max="800"' })}${field('Reihenfolge', 'sort_order', b.sort_order ?? 0, { type: 'number' })}</div>
  <div class="form-row">${field('Anzeigen ab (optional)', 'starts_at', toLocal(b.starts_at), { type: 'datetime-local' })}${field('Anzeigen bis (optional)', 'ends_at', toLocal(b.ends_at), { type: 'datetime-local' })}</div>
  ${check('Sichtbar', 'is_active', b.is_active !== false)}<button class="btn" type="submit">Speichern</button> <a class="btn btn-secondary" href="#/admin/ui">Abbrechen</a></form></div>`;
route('/admin/ui/new', async ({ query }) => page('Neues Element', '/admin/ui', `<div class="panel">${blockForm({ placement: query.placement || 'home_top', type: query.placement === 'home_top' || !query.placement ? 'hero' : 'ad', image_fit: 'cover' })}</div>`), { perm: 'settings.manage' });
route('/admin/ui/:id', async ({ params }) => {
  const d = await api('/admin/blocks');
  const b = d.blocks.find((x) => String(x.id) === params.id);
  if (!b) return page('Element', '/admin/ui', alert('error', 'Element nicht gefunden.'));
  return page('Element bearbeiten', '/admin/ui', `<div class="panel">${blockForm(b)}</div>`);
}, { perm: 'settings.manage' });
onSubmit('block-save', async (f, d) => {
  const id = f.dataset.id;
  await api(id ? '/admin/blocks/' + id : '/admin/blocks', { method: id ? 'PATCH' : 'POST', body: { ...d, height: Number(d.height), sort_order: Number(d.sort_order) } });
  await done('Gespeichert.', '#/admin/ui');
});

// ---------- Einstellungen ----------
route('/admin/settings', async () => {
  const d = await api('/admin/settings'), s = d.settings;
  const color = (label, name, dflt) => `<label class="color-field">${esc(label)}<input type="color" name="${name}" value="${esc(s[name] || dflt)}"></label>`;
  return page('Einstellungen', '/admin/settings', `<form data-submit="settings-save"><div class="panel"><h2>Shop</h2><div class="form-row">${field('Shop-Name', 'shop_name', s.shop_name, { attrs: 'required' })}${field('Stornofrist (Stunden)', 'cancel_window_hours', s.cancel_window_hours, { type: 'number', attrs: 'min="1" max="168"' })}</div>
    ${field('Banner-Text (orange Leiste oben, leer = aus)', 'banner_text', s.banner_text)}${field('Ankündigung (Info-Meldung unter der Leiste, leer = aus)', 'announcement', s.announcement)}
    ${field('Untertitel des Standard-Banners', 'hero_subtitle', s.hero_subtitle)}${field('Footer-Text', 'footer_note', s.footer_note, { area: true })}</div>
    <div class="panel"><h2>Logo & Farben</h2><label>Logo (optional, ersetzt den Text-Schriftzug)</label>${uploadBox('logo_path', s.logo_path || '', 'Am besten PNG mit transparentem Hintergrund.')}
    <div class="color-grid">${color('Kopfzeile', 'color_header', '#131921')}${color('Kategorie-Leiste', 'color_nav', '#232f3e')}${color('Akzentfarbe', 'color_accent', '#ff9900')}${color('Standard-Buttons', 'color_button', '#ffd814')}</div>
    <p class="muted small">Zurücksetzen: Farbfelder lassen sich nicht leeren – Standardwerte sind #131921, #232f3e, #ff9900, #ffd814.</p></div>
    <button class="btn" type="submit">Alles speichern</button></form>
    <div class="panel" style="margin-top:18px"><h2>Lieferzonen</h2><div class="table-wrap"><table class="data"><tbody>${d.zones.map((z) => `<tr><td colspan="2"><form data-submit="zone-save" data-id="${z.id}" class="actions">
      <input type="text" name="name" value="${esc(z.name)}" style="max-width:260px" required><input type="text" name="fee" value="${z.fee}" style="max-width:100px" inputmode="decimal" aria-label="Gebühr"><label class="check" style="margin:0"><input type="checkbox" name="is_active"${checked(z.is_active)}> aktiv</label>
      <button class="btn btn-secondary btn-sm" type="submit">Speichern</button><button type="button" class="btn btn-danger btn-sm" data-click="zone-del" data-id="${z.id}">Löschen</button></form></td></tr>`).join('')}</tbody></table></div>
    <form data-submit="zone-save" class="actions" style="margin-top:10px"><input type="text" name="name" placeholder="Neue Zone" style="max-width:260px" required><input type="text" name="fee" value="0" style="max-width:100px" inputmode="decimal"><button class="btn" type="submit">Zone hinzufügen</button></form></div>`);
}, { perm: 'settings.manage' });
onSubmit('settings-save', async (f, d) => { await api('/admin/settings', { method: 'PATCH', body: d }); await refreshBoot(); await done('Einstellungen gespeichert.'); });
onSubmit('zone-save', async (f, d) => { const id = f.dataset.id; await api(id ? '/admin/zones/' + id : '/admin/zones', { method: id ? 'PATCH' : 'POST', body: d }); await refreshBoot(); await done('Gespeichert.'); });
onClick('zone-del', async (el) => { if (!confirmDel()) return; await api('/admin/zones/' + el.dataset.id, { method: 'DELETE' }); await refreshBoot(); await done('Zone gelöscht.'); });
