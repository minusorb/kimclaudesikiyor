const crypto = require('crypto');
const { put, get, list, del } = require('@vercel/blob');

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };

async function read(path) {
  const r = await get(path, { access: 'private', useCache: false });
  if (!r || r.statusCode !== 200) return null;
  try { return JSON.parse(await new Response(r.stream).text()); } catch { return null; }
}
const write = (path, obj) => put(path, JSON.stringify(obj), { access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json' });
async function all(prefix) {
  const out = [];
  let cursor;
  do {
    const r = await list({ prefix, cursor });
    for (const b of r.blobs) { const v = await read(b.pathname); if (v) out.push(v); }
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);
  return out;
}

const num = (v, max) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max;
const str = (v, n) => v == null || (typeof v === 'string' && v.length <= n);
const near = (a, b) => Math.abs(a - b) <= Math.max(10, 0.01 * Math.max(a, b));
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function check(d, prev, now) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return 'shape';
  if (JSON.stringify(d).length > 90000) return 'size';
  if (!str(d.name, 60) || !str(d.nick, 30) || !str(d.user, 60) || !str(d.host, 80) || !str(d.model, 40) || !str(d.plan, 40)) return 'strings';
  if (!num(d.updated, 9e15) || d.updated < now - 15 * 60e3 || d.updated > now + 5 * 60e3) return 'clock';
  if (!num(d.since, now + 6e4)) return 'since';
  if (d.all && d.all.tok > ((now - d.since) / 1000) * 6e4 + 2e7) return 'faster-than-possible';
  if (!Array.isArray(d.days) || d.days.length < 1 || d.days.length > 31) return 'days';
  let sum7 = 0, sumAll = 0;
  for (const [i, x] of d.days.entries()) {
    if (!x || !DAY.test(x.d) || !num(x.tok, 1e9) || !num(x.usd, 5000)) return 'day-values';
    if (x.usd > (x.tok * 80) / 1e6 + 0.5) return 'price-ratio';
    sumAll += x.tok;
    if (i >= d.days.length - 7) sum7 += x.tok;
  }
  if (!d.today || !d.d7 || !d.all) return 'totals';
  if (!num(d.today.tok, 1e9) || !num(d.d7.tok, 5e9) || !num(d.all.tok, 1e13)) return 'totals';
  if (!num(d.d7.usd, 35000) || !num(d.all.usd, 1e7) || !num(d.d7.sessions, 1e5) || !num(d.d7.prompts, 1e6) || !num(d.all.sessions, 1e6)) return 'totals';
  if (!near(d.today.tok, d.days[d.days.length - 1].tok)) return 'today-mismatch';
  if (!near(d.d7.tok, sum7)) return 'week-mismatch';
  if (d.all.tok < sumAll * 0.99 - 10) return 'all-mismatch';
  if (d.all.usd > (d.all.tok * 80) / 1e6 + 1) return 'price-ratio';
  if (!Array.isArray(d.hours) || d.hours.length > 7) return 'hours';
  const base = d.days.length - d.hours.length;
  for (const [i, row] of d.hours.entries()) {
    if (!Array.isArray(row) || row.length !== 24) return 'hours';
    let s = 0;
    for (const v of row) { if (!num(v, 2e8)) return 'hours'; s += v; }
    if (!near(s, d.days[base + i].tok)) return 'hours-mismatch';
  }
  if (!Array.isArray(d.cal) || d.cal.length > 400) return 'cal';
  for (const c of d.cal) if (!Array.isArray(c) || !DAY.test(c[0]) || !num(c[1], 1e9)) return 'cal';
  for (const w of [d.five, d.week, d.weekFable]) if (w && (!num(w.p, 100) || !str(w.resets, 40))) return 'plan';
  if (prev && prev.data) {
    const dt = Math.max(0, (now - prev.at) / 1000);
    if (d.all.tok - prev.data.all.tok > 6e4 * dt + 2e7) return 'growth';
    if (d.since < prev.data.since - 1000) return 'since-moved';
  }
  return null;
}

module.exports = { del, sha, same, read, write, all, check };
