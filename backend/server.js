const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');

// Ohne Secrets startet der Server nicht
if (!process.env.JWT_SECRET || !process.env.SPOONACULAR_API_KEY) {
  throw new Error('JWT_SECRET or SPOONACULAR_API_KEY is missing in backend/.env');
}

const authRoutes = require('./src/routes/authRoutes');
const recipeRoutes = require('./src/routes/recipeRoutes');
const adminRoutes = require('./src/routes/adminRoutes');

// Express-Server
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Statisches Frontend ausliefern (Client und API auf demselben Origin)
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Modulare Routen-Einbindung
app.use('/api/auth', authRoutes);
app.use('/api/recipes', recipeRoutes);
app.use('/api/admin', adminRoutes);


// Unbekannte API-Routen liefern JSON statt HTML
app.use('/api', (req, res) => {
  return res.status(404).json({ error: 'API endpoint not found.' });
});

app.listen(PORT, () => {
  console.log(`GourmetGuide running on http://localhost:${PORT}`);
});