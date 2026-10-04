const jwt = require('jsonwebtoken');
const { loadUserDatabase } = require('../utils/dbManager');

// MUST 4: prueft den Authorization-Header, verifiziert das JWT und setzt req.user
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Please log in first.' });
  }

  try {
    req.user = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET, { algorithms: ['HS256'] });
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Your session has expired. Please log in again.' });
  }
};

// COULD 2: Rollenpruefung, Rolle kommt aus der DB, damit Rollenwechsel sofort wirken
const authorize = (requiredRole) => async (req, res, next) => {
  try {
    const users = await loadUserDatabase();
    const currentUser = users.find((entry) => entry.id === req.user.id);

    if (!currentUser) {
      return res.status(401).json({ error: 'This account no longer exists.' });
    }
    if (currentUser.role !== requiredRole) {
      return res.status(403).json({ error: 'You are not allowed to do this.' });
    }
    next();
  } catch (error) {
    console.error('Authorization error:', error.message);
    return res.status(500).json({ error: 'Permissions could not be checked.' });
  }
};

module.exports = { authenticate, authorize };
