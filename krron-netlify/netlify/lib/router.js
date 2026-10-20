// Minimaler Router + Auth-Helfer für die API-Funktion.
import crypto from 'node:crypto';
import { q, q1 } from './db.js';
import { HttpError, signToken, verifyToken, parseCookies } from './util.js';

export const COOKIE = 'krron_session';
const WEEK = 7 * 24 * 3600;

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });

let secretCache = null;
/** SESSION_SECRET aus der Umgebung, sonst beim ersten Start zufällig erzeugt und in der DB gespeichert. */
export async function sessionSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (secretCache) return secretCache;
  let row = await q1("SELECT setting_value FROM settings WHERE setting_key = '_session_secret'");
  if (!row) {
    await q("INSERT INTO settings (setting_key, setting_value) VALUES ('_session_secret', $1) ON CONFLICT (setting_key) DO NOTHING",
      [crypto.randomBytes(32).toString('hex')]);
    row = await q1("SELECT setting_value FROM settings WHERE setting_key = '_session_secret'");
  }
  return (secretCache = row.setting_value);
}

export async function sessionCookie(user) {
  const t = signToken({ uid: user.id, tv: user.token_version, exp: Date.now() + WEEK * 1000 }, await sessionSecret());
  return `${COOKIE}=${t}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${WEEK}`;
}
export const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

/** Nutzer + Rolle + Rechte aus dem Cookie laden (oder null). */
export async function currentUser(req) {
  const tok = parseCookies(req.headers.get('cookie'))[COOKIE];
  if (!tok) return null;
  const p = verifyToken(tok, await sessionSecret());
  if (!p) return null;
  const u = await q1(
    `SELECT u.id, u.email, u.phone, u.display_name, u.balance::float8 AS balance, u.force_password_change,
            u.is_banned, u.ban_reason, u.token_version, u.role_id, r.name AS role_name
       FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = $1`, [p.uid]);
  if (!u || u.token_version !== p.tv) return null;
  u.permissions = (await q('SELECT p.perm_key FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id WHERE rp.role_id = $1', [u.role_id]))
    .map((r) => r.perm_key);
  return u;
}
export const publicUser = (u) => u && ({
  id: u.id, email: u.email, phone: u.phone, display_name: u.display_name, balance: u.balance,
  force_password_change: u.force_password_change, role_name: u.role_name, permissions: u.permissions,
});

export class Router {
  constructor() { this.routes = []; }
  add(method, path, handler, opts = {}) {
    const keys = [];
    const re = new RegExp('^' + path.replace(/:([a-z]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
    this.routes.push({ method, re, keys, handler, opts });
  }
  get(p, h, o) { this.add('GET', p, h, o); }
  post(p, h, o) { this.add('POST', p, h, o); }
  patch(p, h, o) { this.add('PATCH', p, h, o); }
  del(p, h, o) { this.add('DELETE', p, h, o); }

  async handle(req, path) {
    let matched = false;
    for (const r of this.routes) {
      const m = r.re.exec(path);
      if (!m) continue;
      matched = true;
      if (r.method !== req.method) continue;
      const params = {};
      r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });

      const user = await currentUser(req);
      const headers = {};
      if (user?.is_banned) {
        return json({ error: 'Dein Konto ist gesperrt.', banned: true, reason: user.ban_reason || null }, 403, { 'set-cookie': clearCookie() });
      }
      if (req.method !== 'GET' && req.method !== 'HEAD' && req.headers.get('x-requested-with') !== 'krron') {
        throw new HttpError(403, 'Ungültige Anfrage.');
      }
      if (r.opts.auth || r.opts.perm) {
        if (!user) throw new HttpError(401, 'Bitte melde dich an.');
        if (user.force_password_change && !r.opts.allowForce) {
          return json({ error: 'Bitte vergib zuerst ein neues Passwort.', code: 'force_pw' }, 403);
        }
        if (r.opts.perm && !user.permissions.includes(r.opts.perm) ) throw new HttpError(403, 'Keine Berechtigung.');
      }
      const ctx = { req, params, user, url: new URL(req.url), headers, body: null };
      if (!['GET', 'HEAD'].includes(req.method) && !r.opts.raw) {
        try { ctx.body = await req.json(); } catch { ctx.body = {}; }
      }
      const out = await r.handler(ctx);
      if (out instanceof Response) return out;
      return json(out ?? { ok: true }, 200, headers);
    }
    if (matched) throw new HttpError(405, 'Methode nicht erlaubt.');
    throw new HttpError(404, 'Nicht gefunden.');
  }
}
