const { same, all } = require('./_lib');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!process.env.BOARD_HASH || !same(req.headers['x-board'] || '', process.env.BOARD_HASH)) return res.status(401).json({ error: 'no' });
  const users = await all('u/');
  res.status(200).json({ at: Date.now(), people: users.filter((u) => u.data && !u.banned).map((u) => u.data) });
};
