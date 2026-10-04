const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/authMiddleware');
const {
  loadUserDatabase,
  saveUserDatabase,
  loadRecipeDatabase,
  saveRecipeDatabase,
  loadFeaturedDatabase,
  saveFeaturedDatabase
} = require('../utils/dbManager');
const { getRecipeDetails } = require('../utils/spoonacular');

const ALLOWED_ROLES = ['user', 'admin'];

// Haupt-Admin aus der .env ist vor anderen Admins geschuetzt
const isOwner = (user) => user.username === (process.env.OWNER_USERNAME || '').toLowerCase();

// COULD 1, COULD 3: alle Routen in diesem Router sind nur fuer Admins
router.use(authenticate, authorize('admin'));

// ---------- Feature 3a: User Management ----------

// GET /users listet alle User ohne Passwort-Hash
router.get('/users', async (req, res) => {
  try {
    const users = await loadUserDatabase();
    const safeUsers = users.map((user) => ({
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
      createdAt: user.createdAt,
      isOwner: isOwner(user)
    }));
    return res.json({ users: safeUsers });
  } catch (error) {
    console.error('Admin users error:', error.message);
    return res.status(500).json({ error: 'User list could not be loaded.' });
  }
});

// PUT /users/:id/role befoerdert oder degradiert einen User
router.put('/users/:id/role', async (req, res) => {
  const { role } = req.body || {};

  if (!ALLOWED_ROLES.includes(role)) {
    return res.status(400).json({ error: 'Role must be user or admin.' });
  }
  // Boundary Case: ein Admin darf sich nicht selbst aussperren
  if (req.params.id === req.user.id) {
    return res.status(400).json({ error: 'You cannot change your own role.' });
  }

  try {
    const users = await loadUserDatabase();
    const target = users.find((entry) => entry.id === req.params.id);

    if (!target) {
      return res.status(404).json({ error: 'User not found.' });
    }
    if (isOwner(target)) {
      return res.status(403).json({ error: 'The main admin cannot be changed.' });
    }

    target.role = role;
    await saveUserDatabase(users);
    return res.json({ message: 'Role updated.', user: { id: target.id, role: target.role } });
  } catch (error) {
    console.error('Role update error:', error.message);
    return res.status(500).json({ error: 'Role could not be changed.' });
  }
});

// DELETE /users/:id loescht einen User inklusive seiner Kochbuch-Eintraege
router.delete('/users/:id', async (req, res) => {
  if (req.params.id === req.user.id) {
    return res.status(400).json({ error: 'You cannot delete your own account.' });
  }

  try {
    const users = await loadUserDatabase();
    const target = users.find((entry) => entry.id === req.params.id);

    if (!target) {
      return res.status(404).json({ error: 'User not found.' });
    }
    if (isOwner(target)) {
      return res.status(403).json({ error: 'The main admin cannot be deleted.' });
    }

    await saveUserDatabase(users.filter((entry) => entry.id !== req.params.id));

    // Kaskadierendes Loeschen: keine verwaisten SavedRecipes zuruecklassen
    const savedRecipes = await loadRecipeDatabase();
    await saveRecipeDatabase(savedRecipes.filter((entry) => entry.userId !== req.params.id));

    return res.json({ message: 'User deleted.' });
  } catch (error) {
    console.error('User delete error:', error.message);
    return res.status(500).json({ error: 'User could not be deleted.' });
  }
});

// ---------- Feature 3b: Content Curation ----------

// POST /featured markiert ein Rezept als Empfehlung fuer die Startseite
router.post('/featured', async (req, res) => {
  const { recipeId } = req.body || {};

  if (!Number.isInteger(recipeId) || recipeId <= 0) {
    return res.status(400).json({ error: 'A valid recipeId is required.' });
  }

  try {
    const featured = await loadFeaturedDatabase();

    if (featured.some((entry) => entry.recipeId === recipeId)) {
      return res.status(409).json({ error: 'This recipe is already featured.' });
    }

    // Rezeptdaten von Spoonacular holen (aus dem Cache, falls schon geladen)
    const details = await getRecipeDetails(recipeId);
    if (!details) {
      return res.status(404).json({ error: 'Recipe not found.' });
    }

    // Kartendaten lokal speichern, damit die Startseite keine API-Punkte kostet
    const newEntry = {
      recipeId,
      title: details.title,
      image: details.image,
      readyInMinutes: details.readyInMinutes,
      healthScore: details.healthScore,
      vegetarian: details.vegetarian,
      vegan: details.vegan,
      glutenFree: details.glutenFree,
      dateFeatured: new Date().toISOString()
    };

    featured.push(newEntry);
    await saveFeaturedDatabase(featured);
    return res.status(201).json({ message: 'Recipe featured.', featured: newEntry });
  } catch (error) {
    console.error('Featured save error:', error.message);
    return res.status(502).json({ error: 'Recipe could not be featured.' });
  }
});

// DELETE /featured/:recipeId entfernt eine Empfehlung
router.delete('/featured/:recipeId', async (req, res) => {
  const recipeId = Number(req.params.recipeId);

  try {
    const featured = await loadFeaturedDatabase();

    if (!featured.some((entry) => entry.recipeId === recipeId)) {
      return res.status(404).json({ error: 'Featured recipe not found.' });
    }

    await saveFeaturedDatabase(featured.filter((entry) => entry.recipeId !== recipeId));
    return res.json({ message: 'Recipe removed from featured.' });
  } catch (error) {
    console.error('Featured delete error:', error.message);
    return res.status(500).json({ error: 'Featured recipe could not be removed.' });
  }
});

module.exports = router;
