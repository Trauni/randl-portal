const { hasArea, roleFromGroups, tagsFromGroups } = require('../utils/permissions');

/**
 * Schuetzt eine Route anhand eines Bereichs aus permissions.js.
 * Verwendung: app.use('/api/it/system', requireArea('it'), router)
 *
 * Uebergang: Sessions von vor dem Rollen-Redesign tragen nur `groups`.
 * Fuer die wird role/accessTags on the fly abgeleitet, damit niemand
 * ausgesperrt wird. Kann entfallen, sobald alle Sessions rotiert sind.
 */
module.exports = (area) => (req, res, next) => {
  const user = req.session && req.session.user;
  if (!user) return res.status(401).json({ error: 'Nicht eingeloggt' });
  const role = user.role || roleFromGroups(user.groups);
  const tags = user.accessTags || tagsFromGroups(user.groups);
  if (hasArea(role, tags, area)) return next();
  return res.status(403).json({ error: 'Keine Berechtigung' });
};
