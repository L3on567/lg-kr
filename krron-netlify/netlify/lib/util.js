// Reine Hilfsfunktionen (ohne Datenbank) – einzeln testbar.
import crypto from 'node:crypto';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const bad = (m) => new HttpError(400, m);

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// ---------- Passwörter (scrypt, eingebaut – keine Zusatzpakete) ----------
export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}
export function verifyPassword(pw, stored) {
  const [alg, saltHex, keyHex] = String(stored || '').split('$');
  if (alg !== 'scrypt' || !saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, 'hex');
  const key = crypto.scryptSync(pw, Buffer.from(saltHex, 'hex'), expected.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(key, expected);
}

const PW_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
export function randomPassword(len = 12) {
  let s = '';
  for (let i = 0; i < len; i++) s += PW_CHARS[crypto.randomInt(PW_CHARS.length)];
  return s;
}
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function randomCouponCode() {
  let s = '';
  for (let i = 0; i < 12; i++) s += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
  return s;
}
export const normalizeCode = (c) => String(c || '').toUpperCase().replace(/[\s-]+/g, '');

// ---------- Session-Token (HMAC-signiert, im Cookie) ----------
const b64 = (b) => Buffer.from(b).toString('base64url');
export function signToken(payload, secret) {
  const body = b64(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}
export function verifyToken(token, secret, now = Date.now()) {
  if (typeof token !== 'string') return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const good = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(good);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (!p.exp || p.exp < now) return null;
    return p;
  } catch { return null; }
}
export function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

// ---------- Bilder: Dateityp an den Anfangsbytes erkennen ----------
export function sniffImage(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.subarray(0, 6).toString('latin1').startsWith('GIF8')) return 'image/gif';
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

// ---------- Texte / Validierung ----------
export function slugify(text) {
  const s = String(text || '').trim().toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return s || 'kategorie';
}
export const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 190;
export const validColor = (c) => c === '' || c == null || /^#[0-9a-fA-F]{6}$/.test(c);
/** Nur relative Pfade (/..., nicht //...) oder http(s)-Links. */
export function validLink(u) {
  if (!u) return true;
  return /^https?:\/\/[^\s]+$/i.test(u) || (/^\/(?!\/)[^\s]*$/.test(u));
}
export function validImagePath(u) {
  if (!u) return true;
  return /^\/img\/\d+$/.test(u) || /^https?:\/\/[^\s]+$/i.test(u);
}
export const str = (v, max = 255) => String(v ?? '').trim().slice(0, max);
export const int = (v, d = 0) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };
export function money(v) {
  const n = Number(String(v ?? '').replace(',', '.'));
  if (!Number.isFinite(n)) throw bad('Ungültiger Betrag.');
  return round2(n);
}

// ---------- Preislogik ----------
export const applyPercent = (price, pct) => (pct > 0 ? round2(price * (1 - pct / 100)) : round2(price));

export const STATUS = {
  processing: 'In Bearbeitung', express: 'Express-Lieferung',
  in_delivery: 'In Zustellung', delivered: 'Geliefert', cancelled: 'Storniert',
};

/**
 * Preisberechnung. lines: [{product_id, category_id, line_total}]
 * zone: {id, fee}|null, coupon: Zeile aus coupons (Zahlen als Number)|null
 */
export function computeQuote(lines, zone, coupon) {
  const subtotal = round2(lines.reduce((s, l) => s + l.line_total, 0));
  const fee = zone ? Number(zone.fee) : 0;
  const base = round2(subtotal + fee);
  let discount = 0, excess = 0;
  if (coupon) {
    const value = Number(coupon.value);
    if (coupon.type === 'credit') {
      discount = Math.min(value, base);
      excess = round2(value - discount);
    } else {
      let eligible = 0;
      for (const l of lines) {
        const noScope = coupon.product_id == null && coupon.category_id == null;
        const match = (coupon.product_id != null && coupon.product_id === l.product_id)
          || (coupon.category_id != null && l.category_id != null && coupon.category_id === l.category_id);
        if (noScope || match) eligible += l.line_total;
      }
      if (eligible <= 0) throw bad('Dieser Gutschein gilt für keinen Artikel in deinem Warenkorb.');
      discount = Math.min(round2(eligible * value / 100), base);
    }
    discount = round2(discount);
  }
  return { subtotal, fee, discount, excess, total: round2(base - discount) };
}

export function lineProblem(l) {
  if (!l.is_active) return 'Dieser Artikel ist nicht mehr verfügbar.';
  if (l.stock <= 0) return 'Derzeit nicht auf Lager.';
  if (l.quantity > l.stock) return `Nur noch ${l.stock} auf Lager.`;
  return null;
}
