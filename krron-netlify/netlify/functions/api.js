// Krron – API (Netlify Function, v2). Alle Routen unter /api/*, Bilder unter /img/<id>.
import { q, q1, tx } from '../lib/db.js';
import { Router, json, sessionCookie, clearCookie, publicUser, currentUser } from '../lib/router.js';
import {
  HttpError, bad, hashPassword, verifyPassword, randomPassword, validEmail, str, int, round2,
  applyPercent, STATUS,
} from '../lib/util.js';
import { DISC, PCOLS, getSettings, cancelWindowHours, cartLines, quote, placeOrder, cancelOrder, cancelSecondsLeft } from '../lib/shop.js';
import { registerAdmin } from '../lib/admin.js';

const router = new Router();
const PUBLIC_SETTINGS = ['shop_name', 'banner_text', 'hero_subtitle', 'footer_note', 'announcement', 'cancel_window_hours',
  'color_header', 'color_nav', 'color_accent', 'color_button', 'logo_path'];

const activeBlocks = (placement) => q(
  `SELECT id, placement, type, title, subtitle, body, button_text, link_url, image_path, image_alt, image_fit,
          bg_color, text_color, height FROM ui_blocks
    WHERE placement = $1 AND is_active AND (starts_at IS NULL OR starts_at <= now()) AND (ends_at IS NULL OR ends_at >= now())
    ORDER BY sort_order, id`, [placement]);

const withRatings = `LEFT JOIN (SELECT product_id, AVG(rating)::float8 AS avg_rating, COUNT(*)::int AS review_count
                                   FROM reviews GROUP BY product_id) rv ON rv.product_id = p.id`;
const CARD = `${PCOLS}, ${DISC} AS discount_percent, COALESCE(rv.avg_rating,0) AS avg_rating, COALESCE(rv.review_count,0) AS review_count`;

// ---------- Start / Bootstrap ----------
router.get('/bootstrap', async ({ user }) => {
  const s = await getSettings();
  const settings = Object.fromEntries(PUBLIC_SETTINGS.map((k) => [k, s[k] ?? '']));
  const categories = await q('SELECT id, name, slug FROM categories ORDER BY sort_order, name');
  const zones = await q('SELECT id, name, fee::float8 AS fee FROM delivery_zones WHERE is_active ORDER BY id');
  const needsSetup = (await q1('SELECT COUNT(*)::int AS n FROM users')).n === 0;
  let cartCount = 0;
  if (user && !user.force_password_change) {
    cartCount = (await q1('SELECT COALESCE(SUM(quantity),0)::int AS n FROM cart WHERE user_id = $1', [user.id])).n;
  }
  return { settings, categories, zones, needsSetup, user: publicUser(user), cartCount };
});

router.get('/home', async () => {
  const bestsellers = await q(`SELECT ${CARD} FROM products p ${withRatings} WHERE p.is_active AND p.sold_count > 0
                               ORDER BY p.sold_count DESC, p.id LIMIT 8`);
  const deals = await q(`SELECT ${CARD} FROM products p ${withRatings} WHERE p.is_active AND ${DISC} IS NOT NULL
                         ORDER BY ${DISC} DESC, p.id LIMIT 8`);
  const newest = await q(`SELECT ${CARD} FROM products p ${withRatings} WHERE p.is_active ORDER BY p.created_at DESC, p.id DESC LIMIT 12`);
  const [top, middle, bottom] = await Promise.all(['home_top', 'home_middle', 'home_bottom'].map(activeBlocks));
  return { bestsellers, deals, newest, blocks: { top, middle, bottom } };
});

// ---------- Katalog ----------
router.get('/products', async ({ url }) => {
  const term = str(url.searchParams.get('q'), 100);
  const cat = str(url.searchParams.get('cat'), 120);
  const sort = url.searchParams.get('sort') || 'relevance';
  const page = Math.max(1, int(url.searchParams.get('page'), 1));
  const per = 24;
  const where = ['p.is_active'];
  const params = [];
  if (term) { params.push(`%${term.replace(/[\\%_]/g, '\\$&')}%`); where.push(`(p.title ILIKE $${params.length} OR p.description ILIKE $${params.length})`); }
  if (cat) { params.push(cat); where.push(`p.category_id IN (SELECT id FROM categories WHERE slug = $${params.length})`); }
  const order = { price_asc: 'p.price ASC', price_desc: 'p.price DESC', new: 'p.created_at DESC', best: 'p.sold_count DESC' }[sort] || 'p.sold_count DESC, p.title';
  const total = (await q1(`SELECT COUNT(*)::int AS n FROM products p WHERE ${where.join(' AND ')}`, params)).n;
  const items = await q(`SELECT ${CARD} FROM products p ${withRatings} WHERE ${where.join(' AND ')}
                          ORDER BY ${order}, p.id LIMIT ${per} OFFSET ${(page - 1) * per}`, params);
  return { items, total, page, pages: Math.max(1, Math.ceil(total / per)) };
});

router.get('/products/:id', async ({ params, user }) => {
  const p = await q1(`SELECT ${CARD}, c.name AS category_name, c.slug AS category_slug FROM products p ${withRatings}
                       LEFT JOIN categories c ON c.id = p.category_id WHERE p.id = $1 AND p.is_active`, [int(params.id)]);
  if (!p) throw new HttpError(404, 'Produkt nicht gefunden.');
  const reviews = await q(`SELECT r.id, r.rating, r.comment, r.created_at, COALESCE(NULLIF(u.display_name,''), split_part(u.email,'@',1)) AS author
                             FROM reviews r JOIN users u ON u.id = r.user_id WHERE r.product_id = $1 ORDER BY r.created_at DESC LIMIT 50`, [p.id]);
  let myReview = null;
  if (user) myReview = await q1('SELECT rating, comment FROM reviews WHERE product_id = $1 AND user_id = $2', [p.id, user.id]);
  return { product: p, reviews, myReview, side: await activeBlocks('product_side') };
});

router.post('/reviews', async ({ body, user }) => {
  const rating = int(body.rating);
  if (rating < 1 || rating > 5) throw bad('Bitte wähle 1 bis 5 Sterne.');
  const pid = int(body.product_id);
  if (!(await q1('SELECT 1 FROM products WHERE id = $1 AND is_active', [pid]))) throw bad('Produkt nicht gefunden.');
  await q(`INSERT INTO reviews (product_id, user_id, rating, comment) VALUES ($1,$2,$3,$4)
           ON CONFLICT (user_id, product_id) DO UPDATE SET rating = EXCLUDED.rating, comment = EXCLUDED.comment`,
    [pid, user.id, rating, str(body.comment, 2000) || null]);
  return { ok: true };
}, { auth: true });

// ---------- Anmeldung ----------
router.post('/login', async ({ body, headers }) => {
  const email = str(body.email, 190).toLowerCase();
  const u = await q1('SELECT * FROM users WHERE email = $1', [email]);
  // gleiche Rechenzeit, egal ob der Nutzer existiert
  const ok = verifyPassword(String(body.password || ''), u ? u.password_hash : 'scrypt$00$00');
  if (!u || !ok) throw new HttpError(401, 'E-Mail oder Passwort ist falsch.');
  if (u.is_banned) {
    return json({ error: 'Dein Konto wurde gesperrt.', banned: true, reason: u.ban_reason || null }, 403);
  }
  await q('UPDATE users SET last_login_at = now() WHERE id = $1', [u.id]);
  headers['set-cookie'] = await sessionCookie(u);
  return { ok: true, force_password_change: u.force_password_change };
});

router.post('/logout', async ({ headers }) => { headers['set-cookie'] = clearCookie(); return { ok: true }; });

router.post('/change-password', async ({ body, user, headers }) => {
  const pw = String(body.password || '');
  if (pw.length < 8) throw bad('Das neue Passwort muss mindestens 8 Zeichen haben.');
  if (pw.length > 200) throw bad('Das Passwort ist zu lang.');
  if (pw !== String(body.password2 || '')) throw bad('Die Passwörter stimmen nicht überein.');
  const row = await q1('SELECT password_hash FROM users WHERE id = $1', [user.id]);
  if (verifyPassword(pw, row.password_hash)) throw bad('Das neue Passwort muss sich vom bisherigen unterscheiden.');
  if (!user.force_password_change && !verifyPassword(String(body.current || ''), row.password_hash)) throw bad('Das aktuelle Passwort ist falsch.');
  const upd = await q1(`UPDATE users SET password_hash = $1, force_password_change = FALSE, token_version = token_version + 1, updated_at = now()
                         WHERE id = $2 RETURNING id, token_version`, [hashPassword(pw), user.id]);
  headers['set-cookie'] = await sessionCookie(upd);   // andere Sitzungen werden damit ungültig
  return { ok: true };
}, { auth: true, allowForce: true });

// Erster Admin: nur solange es noch keinen Nutzer gibt (optional geschützt durch SETUP_KEY)
router.post('/setup', async ({ body }) => {
  const email = str(body.email, 190).toLowerCase();
  if (!validEmail(email)) throw bad('Bitte eine gültige E-Mail angeben.');
  if (process.env.SETUP_KEY && body.key !== process.env.SETUP_KEY) throw new HttpError(403, 'Falscher Setup-Schlüssel.');
  const pw = randomPassword();
  await tx(async ({ q: run, q1: run1 }) => {
    await run('LOCK TABLE users IN EXCLUSIVE MODE');
    if ((await run1('SELECT COUNT(*)::int AS n FROM users')).n > 0) throw new HttpError(403, 'Die Einrichtung wurde bereits abgeschlossen.');
    await run(`INSERT INTO users (email, display_name, password_hash, role_id, force_password_change) VALUES ($1,'Admin',$2,1,TRUE)`, [email, hashPassword(pw)]);
  });
  return { email, password: pw };
});

// ---------- Warenkorb ----------
const cartPayload = async (uid) => {
  const lines = await cartLines(q, uid);
  return { lines, subtotal: round2(lines.reduce((s, l) => s + l.line_total, 0)) };
};
router.get('/cart', ({ user }) => cartPayload(user.id), { auth: true });
router.post('/cart', async ({ body, user }) => {
  const pid = int(body.product_id), qty = Math.max(1, Math.min(99, int(body.quantity, 1)));
  const p = await q1('SELECT stock FROM products WHERE id = $1 AND is_active', [pid]);
  if (!p) throw bad('Produkt nicht verfügbar.');
  const cur = await q1('SELECT quantity FROM cart WHERE user_id = $1 AND product_id = $2', [user.id, pid]);
  const want = Math.min((cur?.quantity || 0) + qty, p.stock);
  if (want <= 0) throw bad('Derzeit nicht auf Lager.');
  await q(`INSERT INTO cart (user_id, product_id, quantity) VALUES ($1,$2,$3)
           ON CONFLICT (user_id, product_id) DO UPDATE SET quantity = EXCLUDED.quantity`, [user.id, pid, want]);
  return { ok: true, count: (await q1('SELECT COALESCE(SUM(quantity),0)::int AS n FROM cart WHERE user_id = $1', [user.id])).n };
}, { auth: true });
router.patch('/cart/:pid', async ({ params, body, user }) => {
  const qty = int(body.quantity);
  if (qty <= 0) await q('DELETE FROM cart WHERE user_id = $1 AND product_id = $2', [user.id, int(params.pid)]);
  else await q('UPDATE cart SET quantity = LEAST($3, 99) WHERE user_id = $1 AND product_id = $2', [user.id, int(params.pid), qty]);
  return cartPayload(user.id);
}, { auth: true });
router.del('/cart/:pid', async ({ params, user }) => {
  await q('DELETE FROM cart WHERE user_id = $1 AND product_id = $2', [user.id, int(params.pid)]);
  return cartPayload(user.id);
}, { auth: true });

// ---------- Kasse ----------
router.post('/checkout/quote', async ({ body, user }) => {
  const lines = await cartLines(q, user.id);
  try {
    const t = await quote(q, lines, int(body.zone_id), str(body.coupon, 40));
    return { ok: true, subtotal: t.subtotal, fee: t.fee, discount: t.discount, excess: t.excess, total: t.total, coupon: t.coupon && { code: t.coupon.code, type: t.coupon.type } };
  } catch (e) {
    if (e instanceof HttpError) return { ok: false, error: e.message };
    throw e;
  }
}, { auth: true });

router.post('/checkout', async ({ body, user }) => {
  const id = await placeOrder(user.id, { zoneId: int(body.zone_id), address: body.address, payment: body.payment, couponCode: str(body.coupon, 40) });
  return { ok: true, order_id: id };
}, { auth: true });

// ---------- Bestellungen & Konto ----------
async function orderView(o, hours) {
  const items = await q('SELECT product_id, product_title, unit_price::float8 AS unit_price, quantity FROM order_items WHERE order_id = $1 ORDER BY id', [o.id]);
  const messages = await q('SELECT status, message, created_at FROM order_messages WHERE order_id = $1 ORDER BY created_at, id', [o.id]);
  return { ...o, status_label: STATUS[o.status], items, messages, cancel_seconds_left: cancelSecondsLeft(o, hours) };
}
const ORDER_COLS = `o.id, o.status, o.delivery_address, o.payment_method, o.subtotal::float8 AS subtotal,
  o.discount_total::float8 AS discount_total, o.delivery_fee::float8 AS delivery_fee, o.total::float8 AS total,
  o.cancel_reason, o.cancelled_by, o.created_at, EXTRACT(EPOCH FROM (now() - o.created_at))::int AS age_seconds,
  z.name AS zone_name`;
router.get('/orders', async ({ user }) => {
  const hours = await cancelWindowHours();
  const rows = await q(`SELECT ${ORDER_COLS} FROM orders o LEFT JOIN delivery_zones z ON z.id = o.delivery_zone_id
                         WHERE o.user_id = $1 ORDER BY o.id DESC LIMIT 100`, [user.id]);
  return { orders: await Promise.all(rows.map((o) => orderView(o, hours))), cancel_hours: hours };
}, { auth: true });
router.post('/orders/:id/cancel', async ({ params, user }) => {
  await cancelOrder(int(params.id), 'customer', '', user.id);
  return { ok: true };
}, { auth: true });
router.get('/account', async ({ user }) => ({
  user: publicUser(user),
  transactions: await q('SELECT amount::float8 AS amount, reason, created_at FROM balance_transactions WHERE user_id = $1 ORDER BY id DESC LIMIT 30', [user.id]),
  orders: (await q1('SELECT COUNT(*)::int AS n FROM orders WHERE user_id = $1', [user.id])).n,
}), { auth: true });

// ---------- Bilder ----------
router.get('/media/:id', async ({ params }) => {
  const m = await q1('SELECT mime, data FROM media WHERE id = $1', [int(params.id)]);
  if (!m) throw new HttpError(404, 'Bild nicht gefunden.');
  return new Response(m.data, { headers: { 'content-type': m.mime, 'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' } });
});

registerAdmin(router);

export default async (req) => {
  const url = new URL(req.url);
  let path = url.pathname.replace(/^\/\.netlify\/functions\/api/, '');
  const img = /^\/img\/(\d+)$/.exec(path);
  path = img ? `/media/${img[1]}` : path.replace(/^\/api/, '');
  try {
    return await router.handle(req, path || '/');
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: 'Interner Fehler. Bitte versuche es erneut.' }, 500);
  }
};

