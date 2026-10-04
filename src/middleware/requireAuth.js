/**
 * Middleware: Session prüfen — weiterleiten falls nicht eingeloggt
 */
function requireAuth(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }

  // API-Requests: JSON-Fehler
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Nicht authentifiziert' });
  }

  // Browser: Login-Redirect
  res.redirect('/auth/login');
}

module.exports = requireAuth;
