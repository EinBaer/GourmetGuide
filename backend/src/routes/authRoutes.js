const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const router = express.Router();
const { loadUserDatabase, saveUserDatabase } = require('../utils/dbManager');
const { authenticate } = require('../middleware/authMiddleware');

const TOKEN_EXPIRY = '24h';
const BCRYPT_ROUNDS = 10;
const MIN_PASSWORD_LENGTH = 8;
const MAX_INPUT_LENGTH = 50;

const createToken = (user) => jwt.sign(
  { id: user.id, username: user.username, role: user.role },
  process.env.JWT_SECRET,
  { expiresIn: TOKEN_EXPIRY }
);

// Nur sichere Felder an den Client schicken, nie den Passwort-Hash
const toPublicUser = (user) => ({
  id: user.id,
  name: user.name,
  username: user.username,
  role: user.role
});

// MUST 3, SHOULD 1: POST /register legt einen neuen User an und gibt ein JWT zurueck
router.post('/register', async (req, res) => {
  const { username, password, name } = req.body || {};

  if (typeof username !== 'string' || typeof password !== 'string' || typeof name !== 'string') {
    return res.status(400).json({ error: 'Name, username and password are required.' });
  }

  const cleanUsername = username.trim().toLowerCase();
  const cleanName = name.trim();

  if (!cleanUsername || !cleanName) {
    return res.status(400).json({ error: 'Name, username and password are required.' });
  }
  if (cleanUsername.length > MAX_INPUT_LENGTH || cleanName.length > MAX_INPUT_LENGTH) {
    return res.status(400).json({ error: `Name and username must be at most ${MAX_INPUT_LENGTH} characters.` });
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
  }

  try {
    const users = await loadUserDatabase();

    if (users.some((entry) => entry.username === cleanUsername)) {
      return res.status(409).json({ error: 'This username is already taken.' });
    }

    const newUser = {
      id: crypto.randomUUID(),
      name: cleanName,
      username: cleanUsername,
      password: await bcrypt.hash(password, BCRYPT_ROUNDS),
      role: 'user',
      createdAt: new Date().toISOString()
    };

    users.push(newUser);
    await saveUserDatabase(users);

    return res.status(201).json({
      message: 'Account created.',
      token: createToken(newUser),
      user: toPublicUser(newUser)
    });
  } catch (error) {
    console.error('Register error:', error.message);
    return res.status(500).json({ error: 'Registration failed due to a server error.' });
  }
});

// MUST 3: POST /login prueft Benutzername und Passwort und gibt ein JWT zurueck
router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};

  if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  try {
    const users = await loadUserDatabase();
    const user = users.find((entry) => entry.username === username.trim().toLowerCase());

    // Gleiche Meldung bei falschem User und falschem Passwort (keine User-Enumeration)
    const passwordMatches = user && await bcrypt.compare(password, user.password);
    if (!passwordMatches) {
      return res.status(401).json({ error: 'Wrong username or password.' });
    }

    return res.json({
      message: 'Logged in.',
      token: createToken(user),
      user: toPublicUser(user)
    });
  } catch (error) {
    console.error('Login error:', error.message);
    return res.status(500).json({ error: 'Login failed due to a server error.' });
  }
});

// MUST 4: GET /me prueft das Token beim App-Start und liefert die aktuelle Rolle
router.get('/me', authenticate, async (req, res) => {
  try {
    const users = await loadUserDatabase();
    const user = users.find((entry) => entry.id === req.user.id);

    if (!user) {
      return res.status(401).json({ error: 'This account no longer exists.' });
    }
    return res.json({ user: toPublicUser(user) });
  } catch (error) {
    console.error('Me error:', error.message);
    return res.status(500).json({ error: 'Account could not be loaded.' });
  }
});

module.exports = router;
