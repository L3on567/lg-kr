// Krron – Shop-Seiten (Kunde)
import {
  state, api, esc, money, date, paragraphs, stars, priceHtml, finalPrice, safeHref, alert, selected,
  flash, notify, takeFlash, onClick, onSubmit, onChange, route, go, refreshBoot, render,
} from './core.js';

const bootUser = () => state.boot.user;

// ---------- Bausteine ----------
function productCard(p, bestseller = false) {
  const final = finalPrice(p);
  const link = `#/p/${p.id}`;
  const badge = p.discount_percent > 0 ? `<span class="badge">-${Math.round(p.discount_percent)}%</span>`
    : bestseller ? '<span class="badge badge-best">Bestseller</span>' : '';
  const stock = p.stock <= 0 ? '<span class="stock-low">Derzeit nicht verfügbar</span>'
    : p.stock <= 5 ? `<span class="stock-low">Nur noch ${p.stock} auf Lager</span>`
    : '<span class="delivery-hint">Lieferung in ganz San Andreas</span>';
  return `<article class="product-card">${badge}
    <a class="img" href="${link}">${p.image_url ? `<img src="${esc(p.image_url)}" alt="${esc(p.title)}" loading="lazy">` : '<span aria-hidden="true">📦</span>'}</a>
    <a class="title" href="${link}">${esc(p.title)}</a>
    ${p.review_count > 0 ? `<div class="stars" title="${p.avg_rating.toFixed(1)} von 5">${stars(p.avg_rating)}<small>${p.review_count}</small></div>` : '<div class="stars stars-empty"></div>'}
    <div class="price">${priceHtml(final)}${p.discount_percent > 0 ? `<span class="old">${money(p.price)}</span>` : ''}</div>
    ${stock}<a class="btn btn-card" href="${link}">Ansehen</a></article>`;
}
const grid = (items, best = false) => `<div class="product-grid">${items.map((p) => productCard(p, best)).join('')}</div>`;
const section = (title, items, link, best) => (items.length ? `<section class="section"><div class="card">
  <div class="section-head"><h2>${esc(title)}</h2>${link ? `<a href="${link}">Alle ansehen</a>` : ''}</div>${grid(items, best)}</div></section>` : '');

function blockHtml(b) {
  const href = b.link_url ? safeHref(b.link_url) : null;
  const style = [b.bg_color && `background:${esc(b.bg_color)}`, b.text_color && `color:${esc(b.text_color)}`].filter(Boolean).join(';');
  const img = b.image_path ? `<img class="ui-ad-img fit-${b.image_fit}" src="${esc(b.image_path)}" alt="${esc(b.image_alt || b.title || '')}" loading="lazy">` : '';
  const h = b.height > 0 ? `height:${Math.min(b.height, 800)}px;` : '';
  if (b.type === 'ad') {
    const inner = `${img}${b.title || b.subtitle ? `<div class="ui-ad-text">${b.title ? `<strong>${esc(b.title)}</strong>` : ''}${b.subtitle ? `<span>${esc(b.subtitle)}</span>` : ''}</div>` : ''}<span class="ui-ad-tag">Anzeige</span>`;
    return href ? `<a class="ui-ad" href="${href}" style="${h}${style}">${inner}</a>` : `<div class="ui-ad" style="${h}${style}">${inner}</div>`;
  }
  if (b.type === 'tile') {
    const inner = `${b.image_path ? `<div class="ui-tile-img"><img class="fit-${b.image_fit}" src="${esc(b.image_path)}" alt="${esc(b.image_alt || b.title || '')}" loading="lazy"></div>` : ''}
      <div class="ui-tile-body">${b.title ? `<h3>${esc(b.title)}</h3>` : ''}${b.subtitle ? `<p>${esc(b.subtitle)}</p>` : ''}${b.button_text ? `<span class="ui-tile-cta">${esc(b.button_text)} ›</span>` : ''}</div>`;
    return href ? `<a class="ui-tile" href="${href}" style="${style}">${inner}</a>` : `<div class="ui-tile" style="${style}">${inner}</div>`;
  }
  if (b.type === 'text') {
    return `<div class="ui-text" style="${style}">${b.title ? `<h3>${esc(b.title)}</h3>` : ''}${b.subtitle ? `<p class="ui-text-sub">${esc(b.subtitle)}</p>` : ''}${b.body ? paragraphs(b.body) : ''}${b.button_text && href ? `<a class="btn" href="${href}">${esc(b.button_text)}</a>` : ''}</div>`;
  }
  return '';
}
function blocksHtml(list) {
  let out = '', tiles = [];
  const flush = () => { if (tiles.length) out += `<div class="ui-tiles">${tiles.join('')}</div>`; tiles = []; };
  for (const b of list) { if (b.type === 'tile') tiles.push(blockHtml(b)); else { flush(); if (b.type !== 'hero') out += blockHtml(b); } }
  flush();
  return out;
}
function heroHtml(heroes, fallbackTitle, fallbackSub) {
  if (!heroes.length) {
    return `<div class="hero"><h1>${esc(fallbackTitle)}</h1><p>${esc(fallbackSub)}</p></div>`;
  }
  const slides = heroes.map((b, i) => {
    const href = b.link_url ? safeHref(b.link_url) : null;
    const style = [b.bg_color && `background:${esc(b.bg_color)}`, b.text_color && `color:${esc(b.text_color)}`, b.height > 0 && `min-height:${Math.min(b.height, 800)}px`].filter(Boolean).join(';');
    return `<div class="ui-slide${b.image_path ? ' has-img' : ''}${i === 0 ? ' is-active' : ''}" style="${style}">
      ${b.image_path ? `<img class="ui-slide-img fit-${b.image_fit}" src="${esc(b.image_path)}" alt="${esc(b.image_alt || b.title || '')}">` : ''}
      <div class="ui-slide-body">${b.title ? `<h2>${esc(b.title)}</h2>` : ''}${b.subtitle ? `<p>${esc(b.subtitle)}</p>` : ''}${b.body ? `<p>${esc(b.body)}</p>` : ''}
      ${b.button_text && href ? `<a class="btn btn-buy" href="${href}">${esc(b.button_text)}</a>` : ''}</div></div>`;
  }).join('');
  const multi = heroes.length > 1;
  return `<div class="ui-hero" id="hero"${multi ? '' : ' data-single'}><div class="ui-slides">${slides}</div>
    <button class="ui-nav prev" data-click="hero-prev" aria-label="Zurück">‹</button><button class="ui-nav next" data-click="hero-next" aria-label="Weiter">›</button>
    <div class="ui-dots">${heroes.map((_, i) => `<button data-click="hero-go" data-i="${i}" class="${i === 0 ? 'is-active' : ''}" aria-label="Slide ${i + 1}"></button>`).join('')}</div></div>`;
}
let heroTimer = null, heroIdx = 0;
function heroShow(i) {
  const slides = document.querySelectorAll('#hero .ui-slide'), dots = document.querySelectorAll('#hero .ui-dots button');
  if (!slides.length) return;
  heroIdx = (i + slides.length) % slides.length;
  slides.forEach((s, n) => s.classList.toggle('is-active', n === heroIdx));
  dots.forEach((d, n) => d.classList.toggle('is-active', n === heroIdx));
}
function heroStart() {
  clearInterval(heroTimer); heroIdx = 0;
  const hero = document.getElementById('hero');
  if (hero && !hero.hasAttribute('data-single')) heroTimer = setInterval(() => { if (!document.getElementById('hero')) clearInterval(heroTimer); else heroShow(heroIdx + 1); }, 6000);
}
onClick('hero-prev', () => { heroShow(heroIdx - 1); heroStart_keep(); });
onClick('hero-next', () => { heroShow(heroIdx + 1); heroStart_keep(); });
onClick('hero-go', (el) => { heroShow(Number(el.dataset.i)); heroStart_keep(); });
function heroStart_keep() { const i = heroIdx; heroStart(); heroIdx = i; }

// ---------- Startseite ----------
route('/', async () => {
  const d = await api('/home');
  const s = state.boot.settings;
  const heroes = d.blocks.top.filter((b) => b.type === 'hero');
  const cats = state.boot.categories;
  const catGrid = cats.length ? `<div class="cat-grid">${cats.map((c) => `<a class="cat-tile" href="#/search?cat=${encodeURIComponent(c.slug)}">${esc(c.name)}<small>Jetzt entdecken ›</small></a>`).join('')}</div>` : '';
  const html = `${takeFlash()}<div id="flash"></div>
    <div class="ui-zone">${heroHtml(heroes, s.shop_name, s.hero_subtitle)}${blocksHtml(d.blocks.top)}</div>
    ${catGrid}${blocksHtml(d.blocks.middle)}
    ${section('Bestseller', d.bestsellers, '#/search?sort=best', true)}
    ${section('Angebote & Rabatte', d.deals)}
    ${section('Neu im Shop', d.newest, '#/search?sort=new')}
    ${blocksHtml(d.blocks.bottom)}
    ${!d.newest.length ? '<div class="card empty">Noch keine Produkte vorhanden.</div>' : ''}`;
  return { html, title: '', after: heroStart };
});

// ---------- Suche / Katalog ----------
route('/search', async ({ query }) => {
  const qs = new URLSearchParams();
  for (const k of ['q', 'cat', 'sort', 'page']) if (query[k]) qs.set(k, query[k]);
  const d = await api('/products?' + qs);
  const cat = state.boot.categories.find((c) => c.slug === query.cat);
  const mk = (over) => '#/search?' + new URLSearchParams({ ...query, ...over }).toString();
  const sorts = { relevance: 'Empfohlen', best: 'Bestseller', price_asc: 'Preis aufsteigend', price_desc: 'Preis absteigend', new: 'Neueste' };
  const html = `<div id="flash"></div><div class="breadcrumb"><a href="#/">Start</a> › ${cat ? esc(cat.name) : 'Alle Produkte'}${query.q ? ` › Suche: „${esc(query.q)}“` : ''}</div>
    <div class="card" style="margin-bottom:16px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;align-items:center">
      <strong>${d.total} Ergebnis${d.total === 1 ? '' : 'se'}</strong>
      <label style="margin:0;font-weight:400">Sortieren: <select data-change="sort" style="width:auto;display:inline-block">${Object.entries(sorts).map(([k, v]) => `<option value="${k}"${selected(query.sort || 'relevance', k)}>${v}</option>`).join('')}</select></label></div>
    ${d.items.length ? grid(d.items) : '<div class="card empty">Keine Produkte gefunden.</div>'}
    ${d.pages > 1 ? `<div class="card" style="margin-top:16px;display:flex;gap:10px;justify-content:center;align-items:center">
      ${d.page > 1 ? `<a class="btn btn-secondary btn-sm" href="${mk({ page: d.page - 1 })}">‹ Zurück</a>` : ''}<span>Seite ${d.page} von ${d.pages}</span>
      ${d.page < d.pages ? `<a class="btn btn-secondary btn-sm" href="${mk({ page: d.page + 1 })}">Weiter ›</a>` : ''}</div>` : ''}`;
  return { html, title: cat?.name || 'Produkte' };
});
onChange('sort', (el) => {
  const [, qs = ''] = location.hash.split('?');
  const p = new URLSearchParams(qs); p.set('sort', el.value); p.delete('page');
  go('#/search?' + p);
});

// ---------- Produktseite ----------
route('/p/:id', async ({ params }) => {
  const d = await api('/products/' + params.id);
  const p = d.product, final = finalPrice(p), u = bootUser();
  const buy = p.stock <= 0 ? '<div class="out">Derzeit nicht verfügbar</div>' : `
    <div class="in">${p.stock <= 5 ? `<span class="low">Nur noch ${p.stock} auf Lager</span>` : 'Auf Lager'}</div>
    <form data-submit="add-cart" style="margin-top:12px"><input type="hidden" name="product_id" value="${p.id}">
      <label style="margin-top:0">Menge</label><select name="quantity">${Array.from({ length: Math.min(p.stock, 10) }, (_, i) => `<option>${i + 1}</option>`).join('')}</select>
      <button class="btn btn-buy btn-block" type="submit">In den Warenkorb</button></form>
    ${u ? '' : '<p class="muted small">Zum Bestellen bitte <a href="#/login">anmelden</a>.</p>'}`;
  const myStars = d.myReview?.rating || 0;
  const reviewForm = u ? `<form class="review-form" data-submit="review"><h3>${d.myReview ? 'Deine Bewertung ändern' : 'Produkt bewerten'}</h3>
      <input type="hidden" name="product_id" value="${p.id}">
      <div class="star-input">${[5, 4, 3, 2, 1].map((n) => `<input type="radio" id="st${n}" name="rating" value="${n}"${myStars === n ? ' checked' : ''}><label for="st${n}">★</label>`).join('')}</div>
      <textarea name="comment" rows="3" maxlength="2000" placeholder="Deine Erfahrung (optional)">${esc(d.myReview?.comment || '')}</textarea>
      <button class="btn" type="submit" style="margin-top:10px">Bewertung speichern</button></form>` : '<p><a href="#/login">Melde dich an</a>, um zu bewerten.</p>';
  const html = `<div id="flash"></div>${takeFlash()}<div class="breadcrumb"><a href="#/">Start</a>${p.category_name ? ` › <a href="#/search?cat=${encodeURIComponent(p.category_slug)}">${esc(p.category_name)}</a>` : ''} › ${esc(p.title)}</div>
    <div class="product-page">
      <div class="card pp-image">${p.image_url ? `<img src="${esc(p.image_url)}" alt="${esc(p.title)}">` : '<span class="pp-noimg">📦</span>'}</div>
      <div class="card pp-info"><h1>${esc(p.title)}</h1>
        ${p.review_count > 0 ? `<div class="stars big">${stars(p.avg_rating)} <a href="#reviews">${p.review_count} Bewertung${p.review_count === 1 ? '' : 'en'}</a></div>` : '<div class="muted small">Noch keine Bewertungen</div>'}
        <hr>${p.discount_percent > 0 ? `<div class="deal-line"><span class="deal-pct">-${Math.round(p.discount_percent)}%</span><span class="deal-price">${priceHtml(final)}</span></div><div class="muted">Statt <s>${money(p.price)}</s></div>` : `<div class="deal-price">${priceHtml(final)}</div>`}
        <hr>${p.description ? paragraphs(p.description) : '<p class="muted">Keine Beschreibung.</p>'}</div>
      <div><div class="card pp-buy">${buy}<p class="muted small" style="margin-bottom:0">Lieferung in ganz San Andreas</p></div>${d.side.map(blockHtml).join('')}</div>
    </div>
    <div class="card reviews" id="reviews"><h2>Kundenbewertungen</h2>${reviewForm}
      ${d.reviews.length ? d.reviews.map((r) => `<div class="review"><strong>${esc(r.author)}</strong> <span class="stars">${stars(r.rating)}</span> <span class="muted small">${date(r.created_at)}</span>${r.comment ? `<p>${esc(r.comment)}</p>` : ''}</div>`).join('') : '<p class="muted">Noch keine Bewertungen.</p>'}</div>`;
  return { html, title: p.title };
});
onSubmit('add-cart', async (f, d) => {
  if (!bootUser()) { flash('info', 'Bitte melde dich an, um den Warenkorb zu nutzen.'); go('#/login'); return; }
  const r = await api('/cart', { method: 'POST', body: { product_id: Number(d.product_id), quantity: Number(d.quantity) } });
  state.boot.cartCount = r.count;
  flash('success', 'Zum Warenkorb hinzugefügt.');
  go('#/cart');
});
onSubmit('review', async (f, d) => {
  if (!d.rating) { notify('error', 'Bitte wähle 1 bis 5 Sterne.'); return; }
  await api('/reviews', { method: 'POST', body: { product_id: Number(d.product_id), rating: Number(d.rating), comment: d.comment } });
  flash('success', 'Danke für deine Bewertung!');
  document.dispatchEvent(new Event('krron:rerender'));
});

// ---------- Warenkorb ----------
route('/cart', async () => {
  const c = await api('/cart');
  state.boot.cartCount = c.lines.reduce((s, l) => s + l.quantity, 0);
  const lines = c.lines.map((l) => `<div class="cart-line">
      <a class="cl-img" href="#/p/${l.product_id}">${l.image_url ? `<img src="${esc(l.image_url)}" alt="">` : '📦'}</a>
      <div class="cl-main"><a href="#/p/${l.product_id}"><strong>${esc(l.title)}</strong></a>
        ${l.discount_percent > 0 ? `<div class="muted small">Rabatt -${Math.round(l.discount_percent)}% · statt ${money(l.list_price)}</div>` : ''}
        ${!l.is_active || l.stock <= 0 ? '<div class="low">Derzeit nicht verfügbar</div>' : l.quantity > l.stock ? `<div class="low">Nur noch ${l.stock} auf Lager</div>` : ''}
        <div class="cl-actions"><input type="number" min="1" max="99" value="${l.quantity}" data-change="cart-qty" data-pid="${l.product_id}" aria-label="Menge">
          <a href="#" data-click="cart-del" data-pid="${l.product_id}">Entfernen</a></div></div>
      <div class="cl-price">${money(l.line_total)}<div class="muted small">${money(l.unit_price)} / Stk.</div></div></div>`).join('');
  const html = `<div id="flash"></div>${takeFlash()}<div class="cart-layout">
    <div class="card"><h1>Warenkorb</h1>${c.lines.length ? lines : '<div class="empty">Dein Warenkorb ist leer. <a href="#/">Weiter stöbern</a></div>'}
      ${c.lines.length ? `<div class="cart-subtotal">Zwischensumme (${c.lines.reduce((s, l) => s + l.quantity, 0)} Artikel): <strong>${money(c.subtotal)}</strong></div>` : ''}</div>
    ${c.lines.length ? `<div class="card cart-side"><div class="cart-subtotal">Zwischensumme: <strong>${money(c.subtotal)}</strong></div>
      <a class="btn btn-buy btn-block" href="#/checkout">Zur Kasse</a></div>` : ''}</div>`;
  return { html, title: 'Warenkorb' };
}, { auth: true });
onChange('cart-qty', async (el) => { await api('/cart/' + el.dataset.pid, { method: 'PATCH', body: { quantity: Number(el.value) } }); await rerender(); });
onClick('cart-del', async (el) => { await api('/cart/' + el.dataset.pid, { method: 'DELETE' }); await rerender(); });
async function rerender() { await refreshBoot(); render(); }

// ---------- Kasse ----------
route('/checkout', async () => {
  const c = await api('/cart');
  if (!c.lines.length) return { redirect: '#/cart' };
  const b = state.boot, u = b.user;
  const html = `<div id="flash"></div><h1>Kasse</h1><div class="checkout-layout"><form data-submit="checkout" id="co">
    <div class="card"><h2>1. Lieferung</h2>
      <label for="zone">Lieferort / Zone</label><select id="zone" name="zone_id" data-change="quote">${b.zones.map((z) => `<option value="${z.id}">${esc(z.name)}${z.fee > 0 ? ` (+${money(z.fee)})` : ''}</option>`).join('')}</select>
      <label for="addr">RP-Adresse</label><input id="addr" name="address" type="text" maxlength="255" required placeholder="z. B. Vinewood Blvd 12, Appartement 4"></div>
    <div class="card"><h2>2. Zahlung</h2>
      <label class="radio-line"><input type="radio" name="payment" value="cash" checked> Bar bei Lieferung</label>
      <label class="radio-line"><input type="radio" name="payment" value="balance"> Krron-Guthaben (verfügbar: ${money(u.balance)})</label></div>
    <div class="card"><h2>3. Gutschein</h2><p class="muted small">Pro Bestellung ist ein Gutschein möglich.</p>
      <div class="coupon-row"><input type="text" name="coupon" maxlength="40" placeholder="12-stelliger Code" autocomplete="off"><button class="btn btn-secondary" type="button" data-click="quote">Prüfen</button></div></div>
    <button class="btn btn-buy" type="submit">Jetzt kostenpflichtig bestellen</button></form>
    <div class="card checkout-side"><h2>Übersicht</h2>${c.lines.map((l) => `<div class="sum-line"><span>${l.quantity} × ${esc(l.title)}</span><span>${money(l.line_total)}</span></div>`).join('')}
      <div id="sums"></div></div></div>`;
  return { html, title: 'Kasse', after: () => doQuote().catch(() => {}) };
}, { auth: true });
async function doQuote() {
  const f = document.getElementById('co');
  if (!f) return;
  const r = await api('/checkout/quote', { method: 'POST', body: { zone_id: Number(f.zone_id.value), coupon: f.coupon.value } });
  const el = document.getElementById('sums');
  if (!r.ok) { el.innerHTML = alert('error', r.error); return; }
  el.innerHTML = `<div class="sum-line"><span>Zwischensumme</span><span>${money(r.subtotal)}</span></div>
    <div class="sum-line"><span>Lieferung</span><span>${r.fee > 0 ? money(r.fee) : 'kostenlos'}</span></div>
    ${r.discount > 0 ? `<div class="sum-line green"><span>Gutschein ${esc(r.coupon?.code || '')}</span><span>−${money(r.discount)}</span></div>` : ''}
    ${r.excess > 0 ? `<div class="sum-line green"><span>Restwert aufs Guthaben</span><span>+${money(r.excess)}</span></div>` : ''}
    <div class="sum-line total"><span>Gesamt</span><span>${money(r.total)}</span></div>`;
}
onClick('quote', () => doQuote());
onChange('quote', () => doQuote());
onSubmit('checkout', async (f, d) => {
  const r = await api('/checkout', { method: 'POST', body: { zone_id: Number(d.zone_id), address: d.address, payment: d.payment, coupon: d.coupon } });
  await refreshBoot();
  flash('success', `Bestellung #${r.order_id} wurde aufgegeben. Danke!`);
  go('#/orders');
});

// ---------- Bestellungen ----------
const tagFor = (s) => ({ delivered: 'tag-green', cancelled: 'tag-red', express: 'tag-orange' }[s] || '');
const fmtLeft = (sec) => { const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60); return `${h} Std. ${m} Min.`; };
route('/orders', async () => {
  const d = await api('/orders');
  const html = `<div id="flash"></div>${takeFlash()}<h1>Meine Bestellungen</h1>
    ${d.orders.length ? d.orders.map((o) => `<div class="card order-card"><div class="order-head">
      <div>Bestellt am<strong>${date(o.created_at)}</strong></div><div>Gesamt<strong>${money(o.total)}</strong></div>
      <div>Lieferort<strong>${esc(o.zone_name || '–')}</strong></div><div>Bestellung<strong>#${o.id}</strong></div>
      <div>Status<strong><span class="tag ${tagFor(o.status)}">${esc(o.status_label)}</span></strong></div></div>
      <div class="order-body"><div class="order-items">${o.items.map((i) => `<div class="sum-line"><span>${i.quantity} × ${i.product_id ? `<a href="#/p/${i.product_id}">${esc(i.product_title)}</a>` : esc(i.product_title)}</span><span>${money(i.unit_price * i.quantity)}</span></div>`).join('')}
        ${o.delivery_fee > 0 ? `<div class="sum-line"><span>Lieferung</span><span>${money(o.delivery_fee)}</span></div>` : ''}
        ${o.discount_total > 0 ? `<div class="sum-line green"><span>Gutschein</span><span>−${money(o.discount_total)}</span></div>` : ''}</div>
        <p class="muted small">Adresse: ${esc(o.delivery_address)} · Zahlung: ${o.payment_method === 'balance' ? 'Krron-Guthaben' : 'Bar bei Lieferung'}</p>
        ${o.messages.map((m) => `<div class="order-msg"><small>${date(m.created_at)}</small>${esc(m.message)}</div>`).join('')}
        ${o.status === 'cancelled' && o.cancel_reason ? `<div class="order-note"><strong>Storniert${o.cancelled_by === 'admin' ? ' durch das Team' : ''}:</strong> ${esc(o.cancel_reason)}</div>` : ''}
        ${o.cancel_seconds_left > 0 ? `<button class="btn btn-danger btn-sm" data-click="cancel-order" data-id="${o.id}">Bestellung stornieren</button> <span class="muted small">noch ${fmtLeft(o.cancel_seconds_left)} möglich</span>`
          : (['processing', 'express'].includes(o.status) ? `<span class="muted small">Die Stornofrist von ${d.cancel_hours} Stunden ist abgelaufen.</span>` : '')}</div></div>`).join('')
      : '<div class="card empty">Du hast noch keine Bestellungen.</div>'}`;
  return { html, title: 'Bestellungen' };
}, { auth: true });
onClick('cancel-order', async (el) => {
  if (!confirm('Bestellung wirklich stornieren?')) return;
  await api(`/orders/${el.dataset.id}/cancel`, { method: 'POST', body: {} });
  await refreshBoot(); flash('success', 'Bestellung storniert.'); document.dispatchEvent(new Event('krron:rerender'));
});

// ---------- Konto ----------
route('/account', async () => {
  const d = await api('/account'), u = d.user;
  const html = `<div id="flash"></div>${takeFlash()}<h1>Mein Konto</h1><div class="account-grid">
    <div class="card"><h2>Profil</h2><p><strong>${esc(u.display_name || u.email)}</strong><br>${esc(u.email)}<br>${esc(u.phone || '')}</p><p class="muted">Rolle: ${esc(u.role_name)}</p>
      <p><a href="#/orders">Meine Bestellungen (${d.orders})</a></p></div>
    <div class="card"><h2>Krron-Guthaben</h2><div class="balance-big">${money(u.balance)}</div>
      ${d.transactions.length ? `<table class="table-simple"><thead><tr><th>Datum</th><th>Grund</th><th>Betrag</th></tr></thead><tbody>${d.transactions.map((t) => `<tr><td>${date(t.created_at)}</td><td>${esc(t.reason)}</td><td class="${t.amount >= 0 ? 'green' : ''}">${t.amount >= 0 ? '+' : ''}${money(t.amount)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Noch keine Buchungen.</p>'}</div>
    <div class="card"><h2>Passwort ändern</h2><form data-submit="change-pw-account">
      <label>Aktuelles Passwort</label><input type="password" name="current" required autocomplete="current-password">
      <label>Neues Passwort (mind. 8 Zeichen)</label><input type="password" name="password" required minlength="8" autocomplete="new-password">
      <label>Neues Passwort wiederholen</label><input type="password" name="password2" required minlength="8" autocomplete="new-password">
      <button class="btn btn-block" type="submit">Passwort ändern</button></form></div></div>`;
  return { html, title: 'Konto' };
}, { auth: true });
onSubmit('change-pw-account', async (f, d) => {
  await api('/change-password', { method: 'POST', body: d });
  flash('success', 'Passwort geändert.'); document.dispatchEvent(new Event('krron:rerender'));
});

// ---------- Anmeldung ----------
const authBox = (inner) => `<div class="auth-box"><a class="auth-logo" href="#/">${esc(state.boot.settings.shop_name)}<span>.shop</span></a><div class="card">${inner}</div></div>`;
route('/login', async () => {
  if (state.boot.user) return { redirect: state.boot.user.force_password_change ? '#/change-password' : '#/' };
  const html = authBox(`<div id="flash"></div>${takeFlash()}<h1 style="font-size:26px">Anmelden</h1>
    <form data-submit="login"><label>E-Mail</label><input type="email" name="email" required autocomplete="username">
    <label>Passwort</label><input type="password" name="password" required autocomplete="current-password">
    <button class="btn btn-primary btn-block" type="submit">Anmelden</button></form>
    <p class="muted small" style="margin-top:16px">Konten werden vom Team angelegt. Du hast noch keins? Melde dich im Spiel beim Support.</p>
    ${state.boot.needsSetup ? '<p><a href="#/setup">Ersteinrichtung: Admin-Konto anlegen</a></p>' : ''}`);
  return { html, title: 'Anmelden', bare: true };
});
onSubmit('login', async (f, d) => {
  try {
    const r = await api('/login', { method: 'POST', body: d });
    await refreshBoot();
    go(r.force_password_change ? '#/change-password' : '#/');
  } catch (e) {
    if (e.data?.banned) {
      document.getElementById('flash').innerHTML = `<div class="alert alert-error"><strong>Dein Konto ist gesperrt.</strong>${e.data.reason ? `<br>Begründung: ${esc(e.data.reason)}` : ''}</div>`;
      return;
    }
    throw e;
  }
});
route('/change-password', async () => {
  const u = state.boot.user;
  if (!u) return { redirect: '#/login' };
  const html = authBox(`<div id="flash"></div><h1 style="font-size:26px">Neues Passwort festlegen</h1>
    ${u.force_password_change ? alert('info', 'Du meldest dich zum ersten Mal an (oder dein Passwort wurde zurückgesetzt). Bitte vergib jetzt ein eigenes Passwort.') : ''}
    <form data-submit="change-pw-first">${u.force_password_change ? '' : '<label>Aktuelles Passwort</label><input type="password" name="current" required>'}
    <label>Neues Passwort (mind. 8 Zeichen)</label><input type="password" name="password" required minlength="8" autocomplete="new-password">
    <label>Neues Passwort wiederholen</label><input type="password" name="password2" required minlength="8" autocomplete="new-password">
    <button class="btn btn-primary btn-block" type="submit">Passwort speichern</button></form>
    <p style="margin-top:14px"><a href="#" data-click="logout">Abmelden</a></p>`);
  return { html, title: 'Passwort ändern', bare: true };
});
onSubmit('change-pw-first', async (f, d) => {
  await api('/change-password', { method: 'POST', body: d });
  await refreshBoot();
  flash('success', 'Passwort gespeichert. Willkommen!');
  go('#/');
});
onClick('logout', async () => { await api('/logout', { method: 'POST', body: {} }); await refreshBoot(); go('#/'); });

// ---------- Ersteinrichtung ----------
route('/setup', async () => {
  if (!state.boot.needsSetup) return { redirect: '#/login' };
  const html = authBox(`<div id="flash"></div><h1 style="font-size:26px">Ersteinrichtung</h1>
    <p class="muted">Lege das erste Admin-Konto an. Du bekommst ein Einmal-Passwort und musst es beim ersten Login ändern.</p>
    <form data-submit="setup"><label>Admin-E-Mail</label><input type="email" name="email" required>
    <label>Setup-Schlüssel <span class="muted small">(nur nötig, wenn SETUP_KEY in Netlify gesetzt ist)</span></label><input type="text" name="key" autocomplete="off">
    <button class="btn btn-primary btn-block" type="submit">Admin anlegen</button></form><div id="setup-out"></div>`);
  return { html, title: 'Setup', bare: true };
});
onSubmit('setup', async (f, d) => {
  const r = await api('/setup', { method: 'POST', body: d });
  await refreshBoot();
  document.getElementById('setup-out').innerHTML = `<div class="alert alert-success" style="margin-top:16px">Admin angelegt. Notiere dir das Einmal-Passwort – es wird nur jetzt angezeigt:<code class="otp">${esc(r.password)}</code>
    E-Mail: <strong>${esc(r.email)}</strong><p><a class="btn" href="#/login">Zum Login</a></p></div>`;
  f.hidden = true;
});
