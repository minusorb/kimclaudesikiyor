const crypto = require('crypto');
const { del, sha, same, read, write, all, check } = require('./_lib');

const ID = /^[0-9a-f]{12}$/;
const MAX_USERS = 40;
const out = (res, code, error) => res.status(code).json({ error });

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return out(res, 405, 'post');
  const b = typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch { return null; } })() : req.body;
  if (!b || typeof b !== 'object') return out(res, 400, 'body');
  const now = Date.now();

  if (req.headers['x-admin']) {
    if (!process.env.ADMIN_HASH || !same(sha(req.headers['x-admin']), process.env.ADMIN_HASH)) return out(res, 403, 'admin');
    if (b.op === 'invite') {
      const code = crypto.randomBytes(12).toString('base64url');
      await write(`invites/${sha(code)}.json`, { used: false, note: String(b.note || '').slice(0, 60), at: now });
      return res.status(200).json({ invite: code });
    }
    if (b.op === 'list') {
      const users = await all('u/');
      return res.status(200).json(users.map((u) => ({ id: u.id, name: u.data && u.data.name, at: u.at, flags: u.flags || 0, last: u.lastReject || null, banned: !!u.banned })));
    }
    if (b.op === 'ban' || b.op === 'unban') {
      const u = ID.test(b.id) && (await read(`u/${b.id}.json`));
      if (!u) return out(res, 404, 'id');
      u.banned = b.op === 'ban';
      await write(`u/${b.id}.json`, u);
      return res.status(200).json({ ok: true });
    }
    if (b.op === 'delete' && ID.test(b.id)) {
      await del(`u/${b.id}.json`);
      return res.status(200).json({ ok: true });
    }
    if (b.op === 'import' && ID.test(b.id) && b.data) {
      await write(`u/${b.id}.json`, { id: b.id, dev: null, data: b.data, at: now, flags: 0 });
      return res.status(200).json({ ok: true });
    }
    return out(res, 400, 'op');
  }

  const { id, token, invite, data } = b;
  if (!ID.test(id || '') || typeof token !== 'string' || token.length < 24 || token.length > 100) return out(res, 400, 'id');
  let u = await read(`u/${id}.json`);

  if (!u || !u.dev) {
    if (typeof invite !== 'string' || invite.length > 60) return out(res, 403, 'invite');
    const inv = await read(`invites/${sha(invite)}.json`);
    if (!inv || inv.used) return out(res, 403, 'invite');
    if (!u && (await all('u/')).length >= MAX_USERS) return out(res, 403, 'full');
    inv.used = true; inv.id = id; inv.usedAt = now;
    await write(`invites/${sha(invite)}.json`, inv);
    u = { id, dev: sha(token), data: u ? u.data : null, at: u ? u.at : 0, flags: 0 };
  } else if (!same(sha(token), u.dev)) {
    return out(res, 403, 'device');
  }
  if (u.banned) return out(res, 403, 'banned');
  if (u.data && now - u.at < 3 * 60e3) return out(res, 429, 'slow');

  const why = check(data, u, now);
  if (why) {
    u.flags = (u.flags || 0) + 1; u.lastReject = { why, at: now };
    await write(`u/${id}.json`, u);
    return out(res, 422, why);
  }
  u.data = data; u.at = now;
  await write(`u/${id}.json`, u);
  res.status(200).json({ ok: true });
};
