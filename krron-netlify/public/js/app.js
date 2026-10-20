// Krron – Start: Bootstrap, Theme, Layout
import { state, api, esc, money, safeHref, alert, route, setShell, render, refreshBoot, hasPerm, go, onSubmit } from './core.js';
import './shop.js';
import { ADMIN_MENU } from './admin.js';

const SVG_SEARCH = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/></svg>';
const SVG_CART = '<svg width="34" height="30" viewBox="0 0 34 30" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 2h5l3.5 16h15L28 7H8"/><circle cx="12" cy="25" r="2"/><circle cx="23" cy="25" r="2"/></svg>';

function applyTheme(s) {
  const r = document.documentElement.style;
  const set = (v, val) => { if (/^#[0-9a-f]{6}$/i.test(val || '')) r.setProperty(v, val); else r.removeProperty(v); };
  set('--nav-dark', s.color_header); set('--nav-mid', s.color_nav); set('--orange', s.color_accent); set('--btn-yellow', s.color_button);
}

const logo = (s, cls = 'logo') => `<a class="${cls}" href="#/">${s.logo_path ? `<img src="${esc(s.logo_path)}" alt="${esc(s.shop_name)}" style="height:36px;display:block">`
  : `<span class="logo-text">${esc(s.shop_name)}</span><span class="logo-dot">.shop</span>`}</a>`;

function shopShell(r) {
  const b = state.boot, s = b.settings, u = b.user, cur = location.hash;
  const cat = new URLSearchParams(location.hash.split('?')[1] || '');
  return `${s.banner_text ? `<div class="announcement">${esc(s.banner_text)}</div>` : ''}
  <header class="site-header"><div class="header-main">${logo(s)}
    <form class="search" data-submit="search" role="search"><select name="cat" aria-label="Kategorie"><option value="">Alle</option>${b.categories.map((c) => `<option value="${esc(c.slug)}"${cat.get('cat') === c.slug ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
      <input type="text" name="q" value="${esc(cat.get('q') || '')}" placeholder="${esc(s.shop_name)} durchsuchen" aria-label="Suche"><button type="submit" aria-label="Suchen">${SVG_SEARCH}</button></form>
    <nav class="header-links">${u ? `<a class="hl" href="#/account"><small>Hallo, ${esc(u.display_name || u.email.split('@')[0])}</small><strong>Konto · ${money(u.balance)}</strong></a>
      <a class="hl" href="#/orders"><small>Meine</small><strong>Bestellungen</strong></a>` : '<a class="hl" href="#/login"><small>Hallo, Gast</small><strong>Anmelden</strong></a>'}
      <a class="hl cart-link" href="#/cart" aria-label="Warenkorb">${SVG_CART}<span class="cart-count">${b.cartCount || 0}</span><strong>Warenkorb</strong></a></nav></div>
    <div class="header-sub"><a href="#/search"${cur.startsWith('#/search') && !cat.get('cat') ? ' class="active"' : ''}>Alle Produkte</a><a href="#/search?sort=best">Bestseller</a>
      ${b.categories.map((c) => `<a href="#/search?cat=${encodeURIComponent(c.slug)}"${cat.get('cat') === c.slug ? ' class="active"' : ''}>${esc(c.name)}</a>`).join('')}<span class="sub-spacer"></span>
      ${hasPerm('admin.access') ? '<a class="admin-link" href="#/admin">Adminpanel</a>' : ''}${u ? '<a href="#" data-click="logout">Abmelden</a>' : ''}</div></header>
  <div class="container">${s.announcement ? alert('info', s.announcement) : ''}${r.html}</div>
  <footer class="site-footer"><a class="to-top" href="#" onclick="window.scrollTo({top:0,behavior:'smooth'});return false">Zurück nach oben</a>
    <div class="footer-inner"><div><h4>${esc(s.shop_name)}</h4><p>${esc(s.footer_note)}</p></div>
      <div><h4>Mein Bereich</h4><a href="#/account">Konto</a><a href="#/orders">Bestellungen</a><a href="#/cart">Warenkorb</a></div>
      <div><h4>Kategorien</h4>${b.categories.map((c) => `<a href="#/search?cat=${encodeURIComponent(c.slug)}">${esc(c.name)}</a>`).join('')}</div></div>
    <div class="footer-bottom">© ${new Date().getFullYear()} ${esc(s.shop_name)} · Roleplay-Shop</div></footer>`;
}

function bareShell(r) {
  return `<div class="auth-page"><div class="container">${r.html}</div></div>`;
}

function adminShell(r) {
  const b = state.boot, u = b.user;
  return `<div class="admin-top">${logo(b.settings, 'logo').replace('.shop', '&nbsp;Admin')}<span class="spacer"></span><span class="who">${esc(u.email)} (${esc(u.role_name)})</span>
    <a href="#/">Zum Shop</a><a href="#" data-click="logout">Abmelden</a></div>
    <div class="admin-wrap"><aside class="admin-side">${ADMIN_MENU.filter(([, , p]) => hasPerm(p)).map(([path, label]) => `<a href="#${path}" class="${r.active === path ? 'active' : ''}">${esc(label)}</a>`).join('')}</aside>
    <main class="admin-main">${r.html}</main></div>`;
}

setShell((r) => {
  document.body.classList.toggle('admin', !!r.admin);
  applyTheme(state.boot.settings);
  return r.admin ? adminShell(r) : r.bare ? bareShell(r) : shopShell(r);
});

onSubmit('search', (f, d) => {
  const p = new URLSearchParams();
  if (d.q) p.set('q', d.q);
  if (d.cat) p.set('cat', d.cat);
  go('#/search' + (p.toString() ? '?' + p : ''));
});

document.addEventListener('krron:rerender', () => render());
// Seite neu laden, wenn Nutzer sich ändert (z. B. Guthaben im Header)
async function start() {
  try {
    await refreshBoot();
    applyTheme(state.boot.settings);
  } catch (e) {
    document.getElementById('app').innerHTML = `<div class="container"><div class="alert alert-error"><strong>Der Shop ist gerade nicht erreichbar.</strong><br>${esc(e.message)}<br>
      <span class="small">Falls das die erste Einrichtung ist: Prüfe in Netlify unter „Deploys", ob die Datenbank-Migration erfolgreich war (siehe README).</span></div></div>`;
    return;
  }
  render();
}
start();
