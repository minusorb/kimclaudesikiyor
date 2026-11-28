const { same, all } = require('./_lib');

// Only these fields of a push ever leave the server: no username, computer name, project folders or device id.
const SAFE = ['updated', 'since', 'model', 'plan', 'planAt', 'five', 'week', 'weekFable', 'rate', 'today', 'd7', 'all', 'days', 'hours', 'cal', 'hm'];
// Shown name: the admin's alias, else the nickname the friend chose, else only the first word of the account name.
const shown = (u) => String(u.alias || u.data.nick || String(u.data.name || '').trim().split(/\s+/)[0] || 'anon').slice(0, 30);

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!process.env.BOARD_HASH || !same(req.headers['x-board'] || '', process.env.BOARD_HASH)) return res.status(401).json({ error: 'no' });
  const users = await all('u/');
  const people = users.filter((u) => u.data && !u.banned).map((u) => {
    const p = { name: shown(u) };
    for (const k of SAFE) if (u.data[k] !== undefined) p[k] = u.data[k];
    return p;
  });
  res.status(200).json({ at: Date.now(), people });
};
