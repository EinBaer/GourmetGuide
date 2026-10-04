require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

// Fail fast: ohne Secrets startet der Server gar nicht erst
['JWT_SECRET', 'SPOONACULAR_API_KEY'].forEach((key) => {
  if (!process.env[key]) {
    throw new Error(`${key} is missing in backend/.env (see .env.example)`);
  }
});

const authRoutes = require('./src/routes/authRoutes');
const recipeRoutes = require('./src/routes/recipeRoutes');
const adminRoutes = require('./src/routes/adminRoutes');

// Backend als eigenstaendige Komponente, Express-Server
const app = express();
const PORT = process.env.PORT || 3000;
const FRONTEND_URL = process.env.FRONTEND_URL || `http://localhost:${PORT}`;

// CORS nur fuer die eigene Frontend-URL zulassen
app.use(cors({
  origin: FRONTEND_URL,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Statisches Frontend ausliefern (Client und API auf demselben Origin)
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Modulare Routen-Einbindung
app.use('/api/auth', authRoutes);
app.use('/api/recipes', recipeRoutes);
app.use('/api/admin', adminRoutes);

app.get('/api/status', (req, res) => {
  return res.json({ status: 'GourmetGuide backend is running.' });
});

// Unbekannte API-Routen liefern JSON statt HTML
app.use('/api', (req, res) => {
  return res.status(404).json({ error: 'API endpoint not found.' });
});

// Globaler Error-Handler, z.B. fuer kaputtes JSON im Request-Body
app.use((error, req, res, next) => {
  console.error('Server error:', error.message);
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON in request body.' });
  }
  return res.status(500).json({ error: 'Internal server error.' });
});

app.listen(PORT, () => {
  console.log(`GourmetGuide running on http://localhost:${PORT}`);
});
