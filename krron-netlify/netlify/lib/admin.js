// Admin-API: Nutzer, Rollen, Bestellungen, Produkte, Kategorien, Gutscheine, Rabatte, UI-Editor, Einstellungen.
import { q, q1, tx } from './db.js';
import {
  HttpError, bad, hashPassword, randomPassword, randomCouponCode, validEmail, validColor, validLink, validImagePath,
  sniffImage, slugify, str, int, money, round2, STATUS,
} from './util.js';
import { cancelOrder, getSettings } from './shop.js';

const PLACEMENTS = ['home_top', 'home_middle', 'home_bottom', 'product_side'];
const SETTING_KEYS = ['shop_name', 'banner_text', 'hero_subtitle', 'footer_note', 'announcement', 'cancel_window_hours',
  'color_header', 'color_nav', 'color_accent', 'color_button', 'logo_path'];
const MAX_IMAGE_BYTES = 3.5 * 1024 * 1024;

const nullable = (v) => (v === '' || v == null ? null : int(v) || null);
const dateOrNull = (v) => {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw bad('Ungültiges Datum.');
  return d.toISOString();
};

/** Bild aus der Datenbank löschen, wenn es nirgends mehr verwendet wird. */
async function dropMediaIfUnused(path) {
  const m = /^\/img\/(\d+)$/.exec(path || '');
  if (!m) return;
  const id = m[1];
  const used = await q1(
    `SELECT (SELECT COUNT(*) FROM products WHERE image_url = $1)
          + (SELECT COUNT(*) FROM ui_blocks WHERE image_path = $1)
          + (SELECT COUNT(*) FROM settings WHERE setting_key = 'logo_path' AND setting_value = $1) AS n`, [path]);
  if (Number(used.n) === 0) await q('DELETE FROM media WHERE id = $1', [int(id)]);
}

export function registerAdmin(router) {
  const P = (perm) => ({ perm });

  // ---------- Dashboard ----------
  router.get('/admin/stats', async () => ({
    users: (await q1('SELECT COUNT(*)::int AS n FROM users')).n,
    products: (await q1('SELECT COUNT(*)::int AS n FROM products')).n,
    open_orders: (await q1("SELECT COUNT(*)::int AS n FROM orders WHERE status IN ('processing','express','in_delivery')")).n,
    revenue: (await q1("SELECT COALESCE(SUM(total),0)::float8 AS n FROM orders WHERE status <> 'cancelled'")).n,
    low_stock: await q('SELECT id, title, stock FROM products WHERE stock <= 5 AND is_active ORDER BY stock, id LIMIT 8'),
  }), P('admin.access'));

  // ---------- Bild-Upload ----------
  router.post('/admin/upload', async ({ body, user }) => {
    if (!user.permissions.includes('products.manage') && !user.permissions.includes('settings.manage')) throw new HttpError(403, 'Keine Berechtigung.');
    const raw = String(body.data || '').replace(/^data:[^,]*;base64,/, '');
    if (!raw) throw bad('Keine Datei empfangen.');
    const buf = Buffer.from(raw, 'base64');
    if (buf.length === 0) throw bad('Die Datei ist leer.');
    if (buf.length > MAX_IMAGE_BYTES) throw bad('Das Bild ist zu groß (max. 3,5 MB).');
    const mime = sniffImage(buf);
    if (!mime) throw bad('Nur JPG-, PNG-, GIF- oder WEBP-Bilder sind erlaubt.');
    const row = await q1('INSERT INTO media (mime, data) VALUES ($1,$2) RETURNING id', [mime, buf]);
    return { path: `/img/${row.id}` };
  }, { auth: true });

  // ---------- Nutzer ----------
  router.get('/admin/users', async ({ url }) => {
    const term = str(url.searchParams.get('q'), 100);
    const rows = await q(
      `SELECT u.id, u.email, u.phone, u.display_name, u.balance::float8 AS balance, u.is_banned, u.force_password_change,
              u.last_login_at, u.created_at, r.name AS role_name, u.role_id
         FROM users u JOIN roles r ON r.id = u.role_id
        WHERE ($1 = '' OR u.email ILIKE $2 OR u.phone ILIKE $2 OR u.display_name ILIKE $2)
        ORDER BY u.id DESC LIMIT 200`, [term, `%${term.replace(/[\\%_]/g, '\\$&')}%`]);
    return { users: rows, roles: await q('SELECT id, name FROM roles ORDER BY id') };
  }, P('users.manage'));

  router.get('/admin/users/:id', async ({ params }) => {
    const u = await q1(
      `SELECT u.id, u.email, u.phone, u.display_name, u.balance::float8 AS balance, u.is_banned, u.ban_reason,
              u.force_password_change, u.last_login_at, u.created_at, u.role_id, r.name AS role_name
         FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1`, [int(params.id)]);
    if (!u) throw new HttpError(404, 'Nutzer nicht gefunden.');
    return {
      user: u,
      notes: await q('SELECT id, note, order_id, created_at FROM driver_notes WHERE user_id = $1 ORDER BY id DESC', [u.id]),
      transactions: await q('SELECT amount::float8 AS amount, reason, created_at FROM balance_transactions WHERE user_id = $1 ORDER BY id DESC LIMIT 30', [u.id]),
      roles: await q('SELECT id, name FROM roles ORDER BY id'),
    };
  }, P('users.manage'));

  router.post('/admin/users', async ({ body, user }) => {
    const email = str(body.email, 190).toLowerCase();
    if (!validEmail(email)) throw bad('Bitte eine gültige E-Mail angeben.');
    const role = await q1('SELECT id FROM roles WHERE id = $1', [int(body.role_id, 2)]);
    if (!role) throw bad('Rolle nicht gefunden.');
    if (await q1('SELECT 1 FROM users WHERE email = $1', [email])) throw bad('Diese E-Mail ist bereits vergeben.');
    const pw = randomPassword();
    const note = str(body.driver_notes, 2000);
    const id = await tx(async ({ q1: r1, q: run }) => {
      const u = await r1(
        `INSERT INTO users (email, phone, display_name, password_hash, role_id, force_password_change)
         VALUES ($1,$2,$3,$4,$5,TRUE) RETURNING id`,
        [email, str(body.phone, 30) || null, str(body.display_name, 100) || null, hashPassword(pw), role.id]);
      if (note) await run('INSERT INTO driver_notes (user_id, note, created_by) VALUES ($1,$2,$3)', [u.id, note, user.id]);
      return u.id;
    });
    return { id, email, password: pw };
  }, P('users.manage'));

  router.patch('/admin/users/:id', async ({ params, body, user }) => {
    const id = int(params.id);
    const email = str(body.email, 190).toLowerCase();
    if (!validEmail(email)) throw bad('Bitte eine gültige E-Mail angeben.');
    if (await q1('SELECT 1 FROM users WHERE email = $1 AND id <> $2', [email, id])) throw bad('Diese E-Mail ist bereits vergeben.');
    let roleId = int(body.role_id);
    if (id === user.id) roleId = user.role_id;   // eigene Rolle nicht änderbar (kein Aussperren)
    if (!(await q1('SELECT 1 FROM roles WHERE id = $1', [roleId]))) throw bad('Rolle nicht gefunden.');
    const r = await q1('UPDATE users SET email=$1, phone=$2, display_name=$3, role_id=$4, updated_at=now() WHERE id=$5 RETURNING id',
      [email, str(body.phone, 30) || null, str(body.display_name, 100) || null, roleId, id]);
    if (!r) throw new HttpError(404, 'Nutzer nicht gefunden.');
    return { ok: true };
  }, P('users.manage'));

  router.post('/admin/users/:id/reset-password', async ({ params }) => {
    const pw = randomPassword();
    const r = await q1(`UPDATE users SET password_hash=$1, force_password_change=TRUE, token_version=token_version+1, updated_at=now()
                         WHERE id=$2 RETURNING email`, [hashPassword(pw), int(params.id)]);
    if (!r) throw new HttpError(404, 'Nutzer nicht gefunden.');
    return { email: r.email, password: pw };
  }, P('users.manage'));

  router.post('/admin/users/:id/balance', async ({ params, body, user }) => {
    const amount = money(body.amount);
    if (amount === 0) throw bad('Der Betrag darf nicht 0 sein.');
    const id = int(params.id);
    return tx(async ({ q1: r1, q: run }) => {
      const u = await r1('SELECT balance::float8 AS balance FROM users WHERE id = $1 FOR UPDATE', [id]);
      if (!u) throw new HttpError(404, 'Nutzer nicht gefunden.');
      if (u.balance + amount < 0) throw bad('Das Guthaben kann nicht unter 0 fallen.');
      await run('UPDATE users SET balance = balance + $1 WHERE id = $2', [amount, id]);
      await run('INSERT INTO balance_transactions (user_id, amount, reason, created_by) VALUES ($1,$2,$3,$4)',
        [id, amount, str(body.reason, 255) || (amount > 0 ? 'Aufladung durch Admin' : 'Abzug durch Admin'), user.id]);
      return { balance: round2(u.balance + amount) };
    });
  }, P('users.manage'));

  router.post('/admin/users/:id/ban', async ({ params, body, user }) => {
    const id = int(params.id);
    const banned = !!body.banned;
    if (banned && id === user.id) throw bad('Du kannst dich nicht selbst sperren.');
    const reason = str(body.reason, 500);
    if (banned && !reason) throw bad('Bitte gib eine Begründung an – der Nutzer sieht sie beim Login.');
    const r = await q1('UPDATE users SET is_banned=$1, ban_reason=$2, updated_at=now() WHERE id=$3 RETURNING id',
      [banned, banned ? reason : null, id]);
    if (!r) throw new HttpError(404, 'Nutzer nicht gefunden.');
    return { ok: true };
  }, P('users.manage'));

  router.post('/admin/users/:id/notes', async ({ params, body, user }) => {
    const note = str(body.note, 2000);
    if (!note) throw bad('Bitte eine Notiz eingeben.');
    await q('INSERT INTO driver_notes (user_id, note, created_by) VALUES ($1,$2,$3)', [int(params.id), note, user.id]);
    return { ok: true };
  }, P('users.manage'));
  router.del('/admin/notes/:id', async ({ params }) => { await q('DELETE FROM driver_notes WHERE id = $1', [int(params.id)]); return { ok: true }; }, P('users.manage'));

  // ---------- Rollen ----------
  router.get('/admin/roles', async () => {
    const roles = await q(`SELECT r.id, r.name, r.description, r.is_system, (SELECT COUNT(*)::int FROM users u WHERE u.role_id = r.id) AS users
                             FROM roles r ORDER BY r.id`);
    const rp = await q('SELECT rp.role_id, p.perm_key FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id');
    for (const r of roles) r.perms = rp.filter((x) => x.role_id === r.id).map((x) => x.perm_key);
    return { roles, permissions: await q('SELECT perm_key, description FROM permissions ORDER BY id') };
  }, P('roles.manage'));

  const savePerms = async (run, roleId, perms) => {
    await run('DELETE FROM role_permissions WHERE role_id = $1', [roleId]);
    if (perms.length) {
      await run('INSERT INTO role_permissions (role_id, permission_id) SELECT $1, id FROM permissions WHERE perm_key = ANY($2::text[])', [roleId, perms]);
    }
  };
  router.post('/admin/roles', async ({ body }) => {
    const name = str(body.name, 50);
    if (!name) throw bad('Bitte einen Rollennamen angeben.');
    if (await q1('SELECT 1 FROM roles WHERE lower(name) = lower($1)', [name])) throw bad('Diese Rolle gibt es schon.');
    const perms = Array.isArray(body.perms) ? body.perms.map(String) : [];
    return tx(async ({ q: run, q1: r1 }) => {
      const r = await r1('INSERT INTO roles (name, description) VALUES ($1,$2) RETURNING id', [name, str(body.description, 255) || null]);
      await savePerms(run, r.id, perms);
      return { id: r.id };
    });
  }, P('roles.manage'));
  router.patch('/admin/roles/:id', async ({ params, body }) => {
    const id = int(params.id);
    const role = await q1('SELECT id, is_system FROM roles WHERE id = $1', [id]);
    if (!role) throw new HttpError(404, 'Rolle nicht gefunden.');
    if (id === 1) throw bad('Die Admin-Rolle behält immer alle Rechte und kann nicht geändert werden.');
    const perms = Array.isArray(body.perms) ? body.perms.map(String) : [];
    await tx(async ({ q: run }) => {
      if (!role.is_system) {
        const name = str(body.name, 50);
        if (!name) throw bad('Bitte einen Rollennamen angeben.');
        if (await q1('SELECT 1 FROM roles WHERE lower(name) = lower($1) AND id <> $2', [name, id])) throw bad('Diese Rolle gibt es schon.');
        await run('UPDATE roles SET name = $1, description = $2 WHERE id = $3', [name, str(body.description, 255) || null, id]);
      } else {
        await run('UPDATE roles SET description = $1 WHERE id = $2', [str(body.description, 255) || null, id]);
      }
      await savePerms(run, id, perms);
    });
    return { ok: true };
  }, P('roles.manage'));
  router.del('/admin/roles/:id', async ({ params }) => {
    const id = int(params.id);
    const role = await q1('SELECT is_system, (SELECT COUNT(*)::int FROM users WHERE role_id = $1) AS users FROM roles WHERE id = $1', [id]);
    if (!role) throw new HttpError(404, 'Rolle nicht gefunden.');
    if (role.is_system) throw bad('Systemrollen können nicht gelöscht werden.');
    if (role.users > 0) throw bad('Diese Rolle ist noch Nutzern zugewiesen.');
    await q('DELETE FROM roles WHERE id = $1', [id]);
    return { ok: true };
  }, P('roles.manage'));

  // ---------- Bestellungen ----------
  router.get('/admin/orders', async ({ url }) => {
    const status = str(url.searchParams.get('status'), 20);
    const term = str(url.searchParams.get('q'), 100);
    const rows = await q(
      `SELECT o.id, o.status, o.total::float8 AS total, o.created_at, o.payment_method, u.email, z.name AS zone_name
         FROM orders o JOIN users u ON u.id = o.user_id LEFT JOIN delivery_zones z ON z.id = o.delivery_zone_id
        WHERE ($1 = '' OR o.status = $1) AND ($2 = '' OR u.email ILIKE $3 OR o.id::text = $2)
        ORDER BY o.id DESC LIMIT 200`, [status, term, `%${term.replace(/[\\%_]/g, '\\$&')}%`]);
    return { orders: rows.map((o) => ({ ...o, status_label: STATUS[o.status] })), statuses: STATUS };
  }, P('orders.view'));

  router.get('/admin/orders/:id', async ({ params }) => {
    const o = await q1(
      `SELECT o.id, o.status, o.delivery_address, o.payment_method, o.subtotal::float8 AS subtotal,
              o.discount_total::float8 AS discount_total, o.delivery_fee::float8 AS delivery_fee, o.total::float8 AS total,
              o.cancel_reason, o.cancelled_by, o.created_at, u.id AS user_id, u.email, u.phone, u.display_name, z.name AS zone_name,
              c.code AS coupon_code
         FROM orders o JOIN users u ON u.id = o.user_id LEFT JOIN delivery_zones z ON z.id = o.delivery_zone_id
         LEFT JOIN coupons c ON c.id = o.coupon_id WHERE o.id = $1`, [int(params.id)]);
    if (!o) throw new HttpError(404, 'Bestellung nicht gefunden.');
    return {
      order: { ...o, status_label: STATUS[o.status] },
      items: await q('SELECT product_title, unit_price::float8 AS unit_price, quantity FROM order_items WHERE order_id = $1 ORDER BY id', [o.id]),
      messages: await q('SELECT status, message, created_at FROM order_messages WHERE order_id = $1 ORDER BY created_at, id', [o.id]),
      notes: await q('SELECT note, order_id, created_at FROM driver_notes WHERE user_id = $1 AND (order_id IS NULL OR order_id = $2) ORDER BY id DESC', [o.user_id, o.id]),
      statuses: STATUS,
    };
  }, P('orders.view'));

  router.post('/admin/orders/:id/status', async ({ params, body, user }) => {
    const id = int(params.id);
    const status = str(body.status, 20);
    if (!STATUS[status] || status === 'cancelled') throw bad('Ungültiger Status. Zum Stornieren die Stornieren-Funktion nutzen.');
    const message = str(body.message, 500);
    await tx(async ({ q1: r1, q: run }) => {
      const o = await r1('SELECT status FROM orders WHERE id = $1 FOR UPDATE', [id]);
      if (!o) throw new HttpError(404, 'Bestellung nicht gefunden.');
      if (['cancelled', 'delivered'].includes(o.status)) throw bad('Diese Bestellung ist abgeschlossen und kann nicht mehr geändert werden.');
      await run('UPDATE orders SET status = $1, updated_at = now() WHERE id = $2', [status, id]);
      await run('INSERT INTO order_messages (order_id, status, message, created_by) VALUES ($1,$2,$3,$4)',
        [id, status, message || `Status geändert: ${STATUS[status]}`, user.id]);
    });
    return { ok: true };
  }, P('orders.manage'));

  router.post('/admin/orders/:id/cancel', async ({ params, body, user }) => {
    const reason = str(body.reason, 500);
    if (!reason) throw bad('Bitte gib einen Stornierungsgrund an – der Kunde sieht ihn.');
    const id = int(params.id);
    await cancelOrder(id, 'admin', reason);
    await q('INSERT INTO order_messages (order_id, status, message, created_by) VALUES ($1,$2,$3,$4)', [id, 'cancelled', reason, user.id]);
    return { ok: true };
  }, P('orders.manage'));

  // ---------- Kategorien ----------
  router.get('/admin/categories', async () => ({
    categories: await q(`SELECT c.id, c.name, c.slug, c.sort_order, (SELECT COUNT(*)::int FROM products p WHERE p.category_id = c.id) AS products
                           FROM categories c ORDER BY c.sort_order, c.name`),
  }), P('categories.manage'));
  const uniqueSlug = async (base, ignoreId = 0) => {
    let slug = slugify(base), n = 2;
    while (await q1('SELECT 1 FROM categories WHERE slug = $1 AND id <> $2', [slug, ignoreId])) slug = `${slugify(base)}-${n++}`;
    return slug;
  };
  router.post('/admin/categories', async ({ body }) => {
    const name = str(body.name, 100);
    if (!name) throw bad('Bitte einen Namen angeben.');
    const r = await q1('INSERT INTO categories (name, slug, sort_order) VALUES ($1,$2,$3) RETURNING id', [name, await uniqueSlug(name), int(body.sort_order)]);
    return { id: r.id };
  }, P('categories.manage'));
  router.patch('/admin/categories/:id', async ({ params, body }) => {
    const id = int(params.id);
    const name = str(body.name, 100);
    if (!name) throw bad('Bitte einen Namen angeben.');
    const r = await q1('UPDATE categories SET name=$1, slug=$2, sort_order=$3 WHERE id=$4 RETURNING id', [name, await uniqueSlug(name, id), int(body.sort_order), id]);
    if (!r) throw new HttpError(404, 'Kategorie nicht gefunden.');
    return { ok: true };
  }, P('categories.manage'));
  router.del('/admin/categories/:id', async ({ params }) => { await q('DELETE FROM categories WHERE id = $1', [int(params.id)]); return { ok: true }; }, P('categories.manage'));

  // ---------- Produkte ----------
  const productFields = (b) => {
    const title = str(b.title, 190);
    if (!title) throw bad('Bitte einen Titel angeben.');
    const price = money(b.price);
    if (price < 0) throw bad('Der Preis darf nicht negativ sein.');
    const stock = int(b.stock);
    if (stock < 0) throw bad('Der Lagerbestand darf nicht negativ sein.');
    const image = str(b.image_url, 500);
    if (!validImagePath(image)) throw bad('Ungültiges Bild.');
    return [nullable(b.category_id), title, str(b.description, 10000) || null, price, stock, image || null, b.is_active === false ? false : true];
  };
  router.get('/admin/products', async ({ url }) => {
    const term = str(url.searchParams.get('q'), 100);
    return {
      products: await q(`SELECT p.id, p.title, p.price::float8 AS price, p.stock, p.image_url, p.is_active, c.name AS category_name
                           FROM products p LEFT JOIN categories c ON c.id = p.category_id
                          WHERE ($1 = '' OR p.title ILIKE $2) ORDER BY p.id DESC LIMIT 300`, [term, `%${term.replace(/[\\%_]/g, '\\$&')}%`]),
      categories: await q('SELECT id, name FROM categories ORDER BY sort_order, name'),
    };
  }, P('products.manage'));
  router.get('/admin/products/:id', async ({ params }) => {
    const p = await q1('SELECT id, category_id, title, description, price::float8 AS price, stock, image_url, is_active FROM products WHERE id = $1', [int(params.id)]);
    if (!p) throw new HttpError(404, 'Produkt nicht gefunden.');
    return { product: p, categories: await q('SELECT id, name FROM categories ORDER BY sort_order, name') };
  }, P('products.manage'));
  router.post('/admin/products', async ({ body }) => {
    const r = await q1(`INSERT INTO products (category_id, title, description, price, stock, image_url, is_active)
                         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`, productFields(body));
    return { id: r.id };
  }, P('products.manage'));
  router.patch('/admin/products/:id', async ({ params, body }) => {
    const id = int(params.id);
    const old = await q1('SELECT image_url FROM products WHERE id = $1', [id]);
    if (!old) throw new HttpError(404, 'Produkt nicht gefunden.');
    const f = productFields(body);
    await q('UPDATE products SET category_id=$1, title=$2, description=$3, price=$4, stock=$5, image_url=$6, is_active=$7, updated_at=now() WHERE id=$8', [...f, id]);
    if (old.image_url && old.image_url !== f[5]) await dropMediaIfUnused(old.image_url);
    return { ok: true };
  }, P('products.manage'));
  router.del('/admin/products/:id', async ({ params }) => {
    const id = int(params.id);
    const old = await q1('DELETE FROM products WHERE id = $1 RETURNING image_url', [id]);
    if (old?.image_url) await dropMediaIfUnused(old.image_url);
    return { ok: true };
  }, P('products.manage'));

  // ---------- Gutscheine & Rabatte ----------
  router.get('/admin/coupons', async () => ({
    coupons: await q(`SELECT c.id, c.code, c.type, c.value::float8 AS value, c.max_uses, c.used_count, c.expires_at, c.is_active, c.created_at,
                             cat.name AS category_name, p.title AS product_title
                        FROM coupons c LEFT JOIN categories cat ON cat.id = c.category_id LEFT JOIN products p ON p.id = c.product_id
                       ORDER BY c.id DESC LIMIT 300`),
    discounts: await q(`SELECT d.id, d.name, d.percent::float8 AS percent, d.category_id, d.product_id, d.starts_at, d.ends_at, d.is_active,
                               cat.name AS category_name, p.title AS product_title
                          FROM discounts d LEFT JOIN categories cat ON cat.id = d.category_id LEFT JOIN products p ON p.id = d.product_id
                         ORDER BY d.id DESC`),
    categories: await q('SELECT id, name FROM categories ORDER BY sort_order, name'),
    products: await q('SELECT id, title FROM products ORDER BY title LIMIT 500'),
  }), P('coupons.manage'));

  router.post('/admin/coupons', async ({ body }) => {
    const type = body.type === 'percent' ? 'percent' : 'credit';
    const value = money(body.value);
    if (value <= 0) throw bad('Der Wert muss größer als 0 sein.');
    if (type === 'percent' && value > 100) throw bad('Prozent-Gutscheine: maximal 100 %.');
    const count = type === 'credit' ? Math.min(Math.max(int(body.count, 1), 1), 50) : 1;
    const maxUses = type === 'credit' ? 1 : Math.max(1, int(body.max_uses, 1));
    const cat = type === 'percent' ? nullable(body.category_id) : null;
    const prod = type === 'percent' ? nullable(body.product_id) : null;
    const expires = dateOrNull(body.expires_at);
    const codes = [];
    for (let i = 0; i < count; i++) {
      for (let tries = 0; tries < 5; tries++) {
        const code = randomCouponCode();
        const r = await q1(`INSERT INTO coupons (code, type, value, category_id, product_id, max_uses, expires_at)
                             VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (code) DO NOTHING RETURNING code`,
          [code, type, value, cat, prod, maxUses, expires]);
        if (r) { codes.push(r.code); break; }
      }
    }
    return { codes };
  }, P('coupons.manage'));
  router.patch('/admin/coupons/:id', async ({ params, body }) => {
    await q('UPDATE coupons SET is_active = $1 WHERE id = $2', [!!body.is_active, int(params.id)]);
    return { ok: true };
  }, P('coupons.manage'));
  router.del('/admin/coupons/:id', async ({ params }) => {
    const c = await q1('SELECT used_count FROM coupons WHERE id = $1', [int(params.id)]);
    if (c && c.used_count > 0) throw bad('Eingelöste Gutscheine können nicht gelöscht werden – deaktiviere ihn stattdessen.');
    await q('DELETE FROM coupons WHERE id = $1', [int(params.id)]);
    return { ok: true };
  }, P('coupons.manage'));

  const discountFields = (b) => {
    const name = str(b.name, 120);
    if (!name) throw bad('Bitte einen Namen angeben.');
    const pct = money(b.percent);
    if (pct <= 0 || pct > 100) throw bad('Prozentwert zwischen 0 und 100 angeben.');
    const cat = nullable(b.category_id), prod = nullable(b.product_id);
    if (!cat && !prod) throw bad('Bitte eine Kategorie oder ein Produkt wählen.');
    return [name, pct, cat, prod, dateOrNull(b.starts_at), dateOrNull(b.ends_at), b.is_active === false ? false : true];
  };
  router.post('/admin/discounts', async ({ body }) => {
    await q('INSERT INTO discounts (name, percent, category_id, product_id, starts_at, ends_at, is_active) VALUES ($1,$2,$3,$4,$5,$6,$7)', discountFields(body));
    return { ok: true };
  }, P('coupons.manage'));
  router.patch('/admin/discounts/:id', async ({ params, body }) => {
    if (Object.keys(body).length === 1 && 'is_active' in body) {
      await q('UPDATE discounts SET is_active = $1 WHERE id = $2', [!!body.is_active, int(params.id)]);
    } else {
      await q('UPDATE discounts SET name=$1, percent=$2, category_id=$3, product_id=$4, starts_at=$5, ends_at=$6, is_active=$7 WHERE id=$8',
        [...discountFields(body), int(params.id)]);
    }
    return { ok: true };
  }, P('coupons.manage'));
  router.del('/admin/discounts/:id', async ({ params }) => { await q('DELETE FROM discounts WHERE id = $1', [int(params.id)]); return { ok: true }; }, P('coupons.manage'));

  // ---------- Einstellungen & Lieferzonen ----------
  router.get('/admin/settings', async () => {
    const s = await getSettings();
    return {
      settings: Object.fromEntries(SETTING_KEYS.map((k) => [k, s[k] ?? ''])),
      zones: await q('SELECT id, name, fee::float8 AS fee, is_active FROM delivery_zones ORDER BY id'),
    };
  }, P('settings.manage'));
  router.patch('/admin/settings', async ({ body }) => {
    const oldLogo = (await getSettings()).logo_path;
    for (const k of SETTING_KEYS) {
      if (!(k in body)) continue;
      let v = str(body[k], k === 'footer_note' || k === 'announcement' || k === 'banner_text' ? 500 : 200);
      if (k.startsWith('color_') && !validColor(v)) throw bad('Farben bitte als #rrggbb angeben.');
      if (k === 'logo_path' && !validImagePath(v)) throw bad('Ungültiges Logo.');
      if (k === 'cancel_window_hours') { const h = int(v); if (h < 1 || h > 168) throw bad('Stornofrist: 1 bis 168 Stunden.'); v = String(h); }
      if (k === 'shop_name' && !v) throw bad('Der Shop-Name darf nicht leer sein.');
      await q(`INSERT INTO settings (setting_key, setting_value) VALUES ($1,$2)
               ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value`, [k, v]);
    }
    if (oldLogo && 'logo_path' in body && oldLogo !== body.logo_path) await dropMediaIfUnused(oldLogo);
    return { ok: true };
  }, P('settings.manage'));

  router.post('/admin/zones', async ({ body }) => {
    const name = str(body.name, 120);
    if (!name) throw bad('Bitte einen Namen angeben.');
    const fee = money(body.fee || 0);
    if (fee < 0) throw bad('Die Gebühr darf nicht negativ sein.');
    await q('INSERT INTO delivery_zones (name, fee) VALUES ($1,$2)', [name, fee]);
    return { ok: true };
  }, P('settings.manage'));
  router.patch('/admin/zones/:id', async ({ params, body }) => {
    const name = str(body.name, 120);
    if (!name) throw bad('Bitte einen Namen angeben.');
    const fee = money(body.fee || 0);
    if (fee < 0) throw bad('Die Gebühr darf nicht negativ sein.');
    await q('UPDATE delivery_zones SET name=$1, fee=$2, is_active=$3 WHERE id=$4', [name, fee, body.is_active !== false, int(params.id)]);
    return { ok: true };
  }, P('settings.manage'));
  router.del('/admin/zones/:id', async ({ params }) => { await q('DELETE FROM delivery_zones WHERE id = $1', [int(params.id)]); return { ok: true }; }, P('settings.manage'));

  // ---------- UI-Editor (Blöcke) ----------
  router.get('/admin/blocks', async () => ({
    blocks: await q('SELECT * FROM ui_blocks ORDER BY placement, sort_order, id'), placements: PLACEMENTS,
  }), P('settings.manage'));

  const blockFields = (b) => {
    const placement = PLACEMENTS.includes(b.placement) ? b.placement : null;
    if (!placement) throw bad('Ungültige Position.');
    const type = ['hero', 'ad', 'tile', 'text'].includes(b.type) ? b.type : 'ad';
    const link = str(b.link_url, 500), image = str(b.image_path, 500);
    if (!validLink(link)) throw bad('Der Link muss mit / oder http(s):// beginnen.');
    if (!validImagePath(image)) throw bad('Ungültiges Bild.');
    const bg = str(b.bg_color, 7), fg = str(b.text_color, 7);
    if (!validColor(bg) || !validColor(fg)) throw bad('Farben bitte als #rrggbb angeben.');
    const height = Math.min(Math.max(int(b.height), 0), 800);
    return [placement, type, str(b.title, 150) || null, str(b.subtitle, 300) || null, str(b.body, 5000) || null,
      str(b.button_text, 60) || null, link || null, image || null, str(b.image_alt, 150) || null,
      b.image_fit === 'contain' ? 'contain' : 'cover', bg || null, fg || null, height, int(b.sort_order),
      b.is_active === false ? false : true, dateOrNull(b.starts_at), dateOrNull(b.ends_at)];
  };
  const BLOCK_COLS = 'placement, type, title, subtitle, body, button_text, link_url, image_path, image_alt, image_fit, bg_color, text_color, height, sort_order, is_active, starts_at, ends_at';
  router.post('/admin/blocks', async ({ body }) => {
    const f = blockFields(body);
    const r = await q1(`INSERT INTO ui_blocks (${BLOCK_COLS}) VALUES (${f.map((_, i) => `$${i + 1}`).join(',')}) RETURNING id`, f);
    return { id: r.id };
  }, P('settings.manage'));
  router.patch('/admin/blocks/:id', async ({ params, body }) => {
    const id = int(params.id);
    const old = await q1('SELECT image_path FROM ui_blocks WHERE id = $1', [id]);
    if (!old) throw new HttpError(404, 'Block nicht gefunden.');
    const f = blockFields(body);
    const sets = BLOCK_COLS.split(', ').map((c, i) => `${c} = $${i + 1}`).join(', ');
    await q(`UPDATE ui_blocks SET ${sets} WHERE id = $${f.length + 1}`, [...f, id]);
    if (old.image_path && old.image_path !== f[7]) await dropMediaIfUnused(old.image_path);
    return { ok: true };
  }, P('settings.manage'));
  router.del('/admin/blocks/:id', async ({ params }) => {
    const old = await q1('DELETE FROM ui_blocks WHERE id = $1 RETURNING image_path', [int(params.id)]);
    if (old?.image_path) await dropMediaIfUnused(old.image_path);
    return { ok: true };
  }, P('settings.manage'));
}
