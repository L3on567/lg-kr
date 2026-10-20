// Shop-Logik mit Datenbankzugriff: Warenkorb, Gutscheine, Bestellung, Storno.
import { q, q1, tx } from './db.js';
import { bad, round2, applyPercent, computeQuote, lineProblem, normalizeCode, str } from './util.js';

export const DISC = `(SELECT MAX(d.percent) FROM discounts d
  WHERE d.is_active AND (d.starts_at IS NULL OR d.starts_at <= now())
    AND (d.ends_at IS NULL OR d.ends_at >= now())
    AND (d.product_id = p.id OR d.category_id = p.category_id))::float8`;

export const PCOLS = `p.id, p.category_id, p.title, p.description, p.price::float8 AS price,
  p.stock, p.image_url, p.is_active, p.sold_count`;

export async function getSettings(run = q) {
  const rows = await run('SELECT setting_key, setting_value FROM settings');
  return Object.fromEntries(rows.map((r) => [r.setting_key, r.setting_value ?? '']));
}
export async function cancelWindowHours(run = q) {
  const s = await getSettings(run);
  const h = parseInt(s.cancel_window_hours, 10);
  return h > 0 ? h : 6;
}

export async function cartLines(run, userId) {
  const rows = await run(
    `SELECT c.id AS cart_id, c.quantity, p.id AS product_id, p.title, p.image_url, p.price::float8 AS price,
            p.stock, p.is_active, p.category_id, ${DISC} AS discount_percent
       FROM cart c JOIN products p ON p.id = c.product_id
      WHERE c.user_id = $1 ORDER BY c.added_at, c.id`, [userId]);
  return rows.map((r) => {
    const pct = Number(r.discount_percent || 0);
    const unit = applyPercent(r.price, pct);
    return {
      cart_id: r.cart_id, product_id: r.product_id, category_id: r.category_id, title: r.title,
      image_url: r.image_url, stock: r.stock, is_active: r.is_active, quantity: r.quantity,
      list_price: r.price, discount_percent: pct, unit_price: unit, line_total: round2(unit * r.quantity),
    };
  });
}

export async function findCoupon(run, code, lock = false) {
  const c = normalizeCode(code);
  const row = await run(
    `SELECT id, code, type, value::float8 AS value, category_id, product_id, max_uses, used_count
       FROM coupons WHERE code = $1 AND is_active AND (expires_at IS NULL OR expires_at >= now())${lock ? ' FOR UPDATE' : ''}`,
    [c]).then((r) => r[0]);
  if (!row) throw bad('Dieser Gutscheincode ist ungültig oder abgelaufen.');
  if (row.used_count >= row.max_uses) throw bad('Dieser Gutscheincode wurde bereits eingelöst.');
  return row;
}

export async function quote(run, lines, zoneId, couponCode, lock = false) {
  let zone = null;
  if (zoneId > 0) {
    zone = await run('SELECT id, name, fee::float8 AS fee FROM delivery_zones WHERE id = $1 AND is_active', [zoneId]).then((r) => r[0] || null);
  }
  const coupon = couponCode ? await findCoupon(run, couponCode, lock) : null;
  return { ...computeQuote(lines, zone, coupon), zone, coupon };
}

export async function placeOrder(userId, { zoneId, address, payment, couponCode }) {
  if (!['cash', 'balance'].includes(payment)) throw bad('Bitte eine Zahlungsmethode wählen.');
  address = str(address, 300);
  if (!address || address.length > 255) throw bad('Bitte gib eine Lieferadresse an (max. 255 Zeichen).');

  return tx(async ({ q: run, q1: run1 }) => {
    const ids = (await run('SELECT product_id FROM cart WHERE user_id = $1', [userId])).map((r) => r.product_id);
    if (!ids.length) throw bad('Dein Warenkorb ist leer.');
    // Produkte sperren, damit der Lagerbestand nicht doppelt vergeben wird
    const fresh = Object.fromEntries((await run(
      'SELECT id, stock, is_active FROM products WHERE id = ANY($1::int[]) ORDER BY id FOR UPDATE', [ids])).map((r) => [r.id, r]));
    const lines = await cartLines(run, userId);
    for (const l of lines) {
      if (fresh[l.product_id]) { l.stock = fresh[l.product_id].stock; l.is_active = fresh[l.product_id].is_active; }
      const p = lineProblem(l);
      if (p) throw bad(`„${l.title}“: ${p}`);
    }
    const zones = Number((await run1('SELECT COUNT(*)::int AS n FROM delivery_zones WHERE is_active')).n);
    const qt = await quote(run, lines, zoneId, couponCode ? normalizeCode(couponCode) : '', true);
    if (zones > 0 && !qt.zone) throw bad('Bitte wähle einen Lieferort.');

    const u = await run1('SELECT balance::float8 AS balance FROM users WHERE id = $1 FOR UPDATE', [userId]);
    if (payment === 'balance' && qt.total > u.balance + 0.00001) {
      throw bad(`Dein Krron-Guthaben (${u.balance.toFixed(2)} $) reicht nicht aus.`);
    }
    const o = await run1(
      `INSERT INTO orders (user_id, status, delivery_zone_id, delivery_address, payment_method, coupon_id,
                           subtotal, discount_total, delivery_fee, total)
       VALUES ($1,'processing',$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [userId, qt.zone?.id ?? null, address, payment, qt.coupon?.id ?? null, qt.subtotal, qt.discount, qt.fee, qt.total]);
    for (const l of lines) {
      await run('INSERT INTO order_items (order_id, product_id, product_title, unit_price, quantity) VALUES ($1,$2,$3,$4,$5)',
        [o.id, l.product_id, l.title, l.unit_price, l.quantity]);
      await run('UPDATE products SET stock = stock - $1, sold_count = sold_count + $1 WHERE id = $2', [l.quantity, l.product_id]);
    }
    if (qt.coupon) await run('UPDATE coupons SET used_count = used_count + 1, redeemed_by = $1 WHERE id = $2', [userId, qt.coupon.id]);
    const txn = (amount, reason) => run('INSERT INTO balance_transactions (user_id, amount, reason) VALUES ($1,$2,$3)', [userId, amount, reason]);
    if (payment === 'balance' && qt.total > 0) {
      await run('UPDATE users SET balance = balance - $1 WHERE id = $2', [qt.total, userId]);
      await txn(-qt.total, `Bestellung #${o.id}`);
    }
    if (qt.excess > 0) {
      await run('UPDATE users SET balance = balance + $1 WHERE id = $2', [qt.excess, userId]);
      await txn(qt.excess, `Gutschein-Restwert (Bestellung #${o.id})`);
    }
    await run('DELETE FROM cart WHERE user_id = $1', [userId]);
    return o.id;
  });
}

/** Storno durch Kunde (by='customer', userId gesetzt) oder Admin. */
export async function cancelOrder(orderId, by, reason = '', userId = null) {
  const hours = await cancelWindowHours();
  return tx(async ({ q: run, q1: run1 }) => {
    const o = await run1(
      `SELECT o.id, o.user_id, o.status, o.coupon_id, o.payment_method, o.total::float8 AS total,
              o.discount_total::float8 AS discount_total,
              EXTRACT(EPOCH FROM (now() - o.created_at))::int AS age_seconds
         FROM orders o WHERE o.id = $1${userId !== null ? ' AND o.user_id = $2' : ''} FOR UPDATE`,
      userId !== null ? [orderId, userId] : [orderId]);
    if (!o) throw bad('Bestellung nicht gefunden.');
    if (o.status === 'cancelled') throw bad('Die Bestellung ist bereits storniert.');
    if (o.status === 'delivered') throw bad('Eine gelieferte Bestellung kann nicht storniert werden.');
    if (by === 'customer') {
      if (!['processing', 'express'].includes(o.status)) throw bad('Die Bestellung ist bereits in Zustellung und kann nicht mehr storniert werden.');
      if (o.age_seconds > hours * 3600) throw bad(`Die Stornierungsfrist von ${hours} Stunden ist abgelaufen.`);
    }
    for (const it of await run('SELECT product_id, quantity FROM order_items WHERE order_id = $1 AND product_id IS NOT NULL', [orderId])) {
      await run('UPDATE products SET stock = stock + $1, sold_count = GREATEST(sold_count - $1, 0) WHERE id = $2', [it.quantity, it.product_id]);
    }
    let coupon = null;
    if (o.coupon_id != null) {
      coupon = await run1('SELECT id, type, value::float8 AS value, used_count FROM coupons WHERE id = $1 FOR UPDATE', [o.coupon_id]);
    }
    const refund = o.payment_method === 'balance' ? round2(o.total) : 0;
    let excess = 0;
    if (coupon && coupon.type === 'credit') excess = Math.max(0, round2(coupon.value - o.discount_total));

    if (refund > 0 || excess > 0) {
      const b = (await run1('SELECT balance::float8 AS balance FROM users WHERE id = $1 FOR UPDATE', [o.user_id])).balance;
      if (by === 'customer' && b + refund + 0.00001 < excess) {
        throw bad('Der Restwert deines Gutscheins wurde schon ausgegeben, deshalb kann die Bestellung nicht selbst storniert werden. Bitte wende dich an das Team.');
      }
      const txn = (amount, why) => run('INSERT INTO balance_transactions (user_id, amount, reason) VALUES ($1,$2,$3)', [o.user_id, amount, why]);
      if (refund > 0) { await run('UPDATE users SET balance = balance + $1 WHERE id = $2', [refund, o.user_id]); await txn(refund, `Erstattung Stornierung #${orderId}`); }
      if (excess > 0) { await run('UPDATE users SET balance = balance - $1 WHERE id = $2', [excess, o.user_id]); await txn(-excess, `Rückbuchung Gutschein-Restwert (Stornierung #${orderId})`); }
    }
    if (coupon) {
      const used = Math.max(0, coupon.used_count - 1);
      await run(used === 0
        ? 'UPDATE coupons SET used_count = 0, redeemed_by = NULL WHERE id = $1'
        : 'UPDATE coupons SET used_count = $2 WHERE id = $1', used === 0 ? [coupon.id] : [coupon.id, used]);
    }
    await run("UPDATE orders SET status = 'cancelled', cancel_reason = $1, cancelled_by = $2, updated_at = now() WHERE id = $3",
      [reason ? str(reason, 500) : null, by === 'admin' ? 'admin' : 'customer', orderId]);
  });
}

export function cancelSecondsLeft(order, hours) {
  if (!['processing', 'express'].includes(order.status)) return 0;
  return Math.max(0, hours * 3600 - order.age_seconds);
}
