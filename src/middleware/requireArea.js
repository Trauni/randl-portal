const { hasArea } = require('../utils/permissions');

/**
 * Schuetzt eine Route anhand eines Bereichs aus permissions.js.
 * Verwendung: app.use('/api/it/system', requireArea('it'), router)
 */
module.exports = (area) => (req, res, next) => {
  const user = req.session && req.session.user;
  if (!user) return res.status(401).json({ error: 'Nicht eingeloggt' });
  if (hasArea(user.role, user.accessTags, area)) return next();
  return res.status(403).json({ error: 'Keine Berechtigung' });
};
