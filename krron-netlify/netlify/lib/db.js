// Datenbankzugriff über Netlify Database (Postgres, Paket @netlify/database).
import { getDatabase } from '@netlify/database';

let injected = null;
let cached = null;
/** Für Tests: eigenen pg-kompatiblen Pool einsetzen. */
export function setPool(p) { injected = p; }
export function pool() {
  if (injected) return injected;
  if (!cached) cached = getDatabase().pool;
  return cached;
}

export async function q(text, params = []) {
  const r = await pool().query(text, params);
  return r.rows;
}
export async function q1(text, params = []) {
  return (await q(text, params))[0] || null;
}

/** Transaktion auf einer eigenen Verbindung. fn bekommt {q, q1}. */
export async function tx(fn) {
  const c = await pool().connect();
  const run = async (text, params = []) => (await c.query(text, params)).rows;
  try {
    await c.query('BEGIN');
    const res = await fn({ q: run, q1: async (t, p) => (await run(t, p))[0] || null });
    await c.query('COMMIT');
    return res;
  } catch (e) {
    try { await c.query('ROLLBACK'); } catch { /* ignorieren */ }
    throw e;
  } finally {
    c.release();
  }
}
