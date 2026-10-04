const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const { loadRecipeDatabase, saveRecipeDatabase, loadFeaturedDatabase } = require('../utils/dbManager');
const { searchRecipes, getRecipeDetails, getSubstitutes } = require('../utils/spoonacular');
const { toEnglish } = require('../utils/translations');

// Allowlists: nur diese Werte werden an Spoonacular weitergegeben
const ALLOWED_CUISINES = [
  'italian', 'french', 'greek', 'spanish', 'german', 'mediterranean', 'middle eastern', 'indian',
  'chinese', 'japanese', 'thai', 'korean', 'vietnamese', 'mexican', 'latin american', 'american'
];
const ALLOWED_DIETS = ['vegetarian', 'vegan', 'gluten free', 'pescetarian', 'ketogenic', 'paleo'];
const ALLOWED_TIMES = ['10', '20', '30', '40', '50', '60', '90', '120'];
const MAX_INGREDIENTS = 10;
const MAX_TERM_LENGTH = 50;
// Spoonacular-Zutatennamen sind teils lang, z.B. "lasagna noodles - according to package instructions"
const MAX_INGREDIENT_NAME_LENGTH = 100;
const MAX_TITLE_LENGTH = 200;
const MAX_NOTES_LENGTH = 1000;
const MIN_RATING = 1;
const MAX_RATING = 5;
// Spoonacular antwortet mit 402, wenn das taegliche Punkte-Limit verbraucht ist
const QUOTA_STATUS = 402;
const QUOTA_MESSAGE = 'New recipes are taking a break until tomorrow - our daily recipe quota is used up. '
  + 'Your cookbook and Chef\'s Picks are still available.';

const readTextParam = (value) => (typeof value === 'string' ? value.trim() : '');

// ---------- Feature 1: Recipe Discovery (Guest, User, Admin) ----------

// MUST 1, MUST 6, SHOULD 3: GET /search?q=pasta oder ?ingredients=reis,chicken (kein Login noetig)
router.get('/search', async (req, res) => {
  const query = readTextParam(req.query.q);
  const ingredientText = readTextParam(req.query.ingredients);
  const { cuisine, diet, maxReadyTime } = req.query;

  if (!query && !ingredientText) {
    return res.status(400).json({ error: 'Please enter a dish or at least one ingredient.' });
  }
  if (query.length > MAX_TERM_LENGTH) {
    return res.status(400).json({ error: `Search term must be at most ${MAX_TERM_LENGTH} characters.` });
  }

  // "Reis, Haehnchen, paprika" -> ['rice', 'chicken', 'bell pepper'], Duplikate werden uebersprungen
  let ingredients = null;
  if (ingredientText) {
    ingredients = [];
    ingredientText.split(',').forEach((part) => {
      const term = toEnglish(part.trim());
      if (term && !ingredients.includes(term)) ingredients.push(term);
    });
  }

  if (ingredients && ingredients.length > MAX_INGREDIENTS) {
    return res.status(400).json({ error: `Please enter at most ${MAX_INGREDIENTS} ingredients.` });
  }
  if (ingredients && ingredients.some((term) => term.length > MAX_TERM_LENGTH)) {
    return res.status(400).json({ error: `Each ingredient must be at most ${MAX_TERM_LENGTH} characters.` });
  }
  if (cuisine && !ALLOWED_CUISINES.includes(cuisine)) {
    return res.status(400).json({ error: 'Unknown cuisine filter.' });
  }
  if (diet && !ALLOWED_DIETS.includes(diet)) {
    return res.status(400).json({ error: 'Unknown diet filter.' });
  }
  if (maxReadyTime && !ALLOWED_TIMES.includes(maxReadyTime)) {
    return res.status(400).json({ error: 'Unknown cooking time filter.' });
  }

  try {
    const englishQuery = query ? toEnglish(query) : '';
    const results = await searchRecipes({ query: englishQuery, ingredients, cuisine, diet, maxReadyTime });
    return res.json({ results });
  } catch (error) {
    console.error('Recipe search error:', error.message);
    const message = error.status === QUOTA_STATUS ? QUOTA_MESSAGE : 'Recipe search failed. Please try again later.';
    return res.status(502).json({ error: message });
  }
});

// MUST 1, MUST 6: GET /details/:id liefert Rezeptdetails inkl. Naehrwerte (kein Login noetig)
router.get('/details/:id', async (req, res) => {
  const recipeId = Number(req.params.id);
  if (!Number.isInteger(recipeId) || recipeId <= 0) {
    return res.status(400).json({ error: 'Invalid recipe ID.' });
  }

  try {
    const details = await getRecipeDetails(recipeId);
    if (!details) {
      return res.status(404).json({ error: 'Recipe not found.' });
    }
    return res.json(details);
  } catch (error) {
    console.error('Recipe detail error:', error.message);
    const message = error.status === QUOTA_STATUS ? QUOTA_MESSAGE : 'Recipe details could not be loaded.';
    return res.status(502).json({ error: message });
  }
});

// SHOULD 3: GET /featured liefert die vom Admin empfohlenen Rezepte (kein Login noetig)
router.get('/featured', async (req, res) => {
  try {
    const featured = await loadFeaturedDatabase();
    return res.json({ featured });
  } catch (error) {
    console.error('Featured load error:', error.message);
    return res.status(500).json({ error: 'Featured recipes could not be loaded.' });
  }
});

// ---------- Feature 2: Personal Cookbook (User, Admin) ----------

// SHOULD 2, SHOULD 4: GET /substitutes?ingredient=butter liefert Zutaten-Alternativen
router.get('/substitutes', authenticate, async (req, res) => {
  const ingredient = toEnglish(readTextParam(req.query.ingredient));

  if (!ingredient || ingredient.length > MAX_INGREDIENT_NAME_LENGTH) {
    return res.status(400).json({ error: 'Please specify a valid ingredient.' });
  }

  try {
    const substitutes = await getSubstitutes(ingredient);
    return res.json({ ingredient, substitutes });
  } catch (error) {
    console.error('Substitute error:', error.message);
    const message = error.status === QUOTA_STATUS ? QUOTA_MESSAGE : 'Substitutes could not be loaded.';
    return res.status(502).json({ error: message });
  }
});

// MUST 2, SHOULD 4: GET /cookbook liefert die gespeicherten Rezepte des eingeloggten Users
router.get('/cookbook', authenticate, async (req, res) => {
  try {
    const savedRecipes = await loadRecipeDatabase();
    return res.json({ recipes: savedRecipes.filter((entry) => entry.userId === req.user.id) });
  } catch (error) {
    console.error('Cookbook load error:', error.message);
    return res.status(500).json({ error: 'Cookbook could not be loaded.' });
  }
});

// MUST 2, MUST 5: POST /cookbook speichert ein Rezept als SavedRecipe
router.post('/cookbook', authenticate, async (req, res) => {
  const { recipeId, title, image } = req.body || {};

  if (!Number.isInteger(recipeId) || recipeId <= 0) {
    return res.status(400).json({ error: 'A valid recipeId is required.' });
  }
  if (typeof title !== 'string' || !title.trim() || title.length > MAX_TITLE_LENGTH) {
    return res.status(400).json({ error: `A title is required (max. ${MAX_TITLE_LENGTH} characters).` });
  }

  try {
    const savedRecipes = await loadRecipeDatabase();

    if (savedRecipes.some((entry) => entry.userId === req.user.id && entry.recipeId === recipeId)) {
      return res.status(409).json({ error: 'This recipe is already in your cookbook.' });
    }

    const newEntry = {
      id: crypto.randomUUID(),
      recipeId,
      userId: req.user.id,
      title: title.trim(),
      image: typeof image === 'string' ? image : '',
      rating: 0,
      notes: '',
      dateAdded: new Date().toISOString()
    };

    savedRecipes.push(newEntry);
    await saveRecipeDatabase(savedRecipes);

    return res.status(201).json({ message: 'Recipe saved.', recipe: newEntry });
  } catch (error) {
    console.error('Cookbook save error:', error.message);
    return res.status(500).json({ error: 'Recipe could not be saved.' });
  }
});

// MUST 2, SHOULD 2: PUT /cookbook/:id aendert Bewertung (1-5) und/oder Notizen
router.put('/cookbook/:id', authenticate, async (req, res) => {
  const { rating, notes } = req.body || {};

  // Throw early: erst validieren, dann die Datenbank anfassen
  if (rating === undefined && notes === undefined) {
    return res.status(400).json({ error: 'Please send a rating or notes.' });
  }
  if (rating !== undefined && (!Number.isInteger(rating) || rating < MIN_RATING || rating > MAX_RATING)) {
    return res.status(400).json({ error: `Rating must be a whole number from ${MIN_RATING} to ${MAX_RATING}.` });
  }
  if (notes !== undefined && (typeof notes !== 'string' || notes.length > MAX_NOTES_LENGTH)) {
    return res.status(400).json({ error: `Notes must be text with at most ${MAX_NOTES_LENGTH} characters.` });
  }

  try {
    const savedRecipes = await loadRecipeDatabase();
    // Ownership-Check: fremde Eintraege verhalten sich wie nicht vorhanden
    const entry = savedRecipes.find((item) => item.id === req.params.id && item.userId === req.user.id);

    if (!entry) {
      return res.status(404).json({ error: 'Recipe not found in your cookbook.' });
    }

    if (rating !== undefined) entry.rating = rating;
    if (notes !== undefined) entry.notes = notes.trim();

    await saveRecipeDatabase(savedRecipes);
    return res.json({ message: 'Recipe updated.', recipe: entry });
  } catch (error) {
    console.error('Cookbook update error:', error.message);
    return res.status(500).json({ error: 'Recipe could not be updated.' });
  }
});

// MUST 2: DELETE /cookbook/:id entfernt ein Rezept aus dem Kochbuch
router.delete('/cookbook/:id', authenticate, async (req, res) => {
  try {
    const savedRecipes = await loadRecipeDatabase();
    const isOwnEntry = (item) => item.id === req.params.id && item.userId === req.user.id;

    if (!savedRecipes.some(isOwnEntry)) {
      return res.status(404).json({ error: 'Recipe not found in your cookbook.' });
    }

    await saveRecipeDatabase(savedRecipes.filter((item) => !isOwnEntry(item)));
    return res.json({ message: 'Recipe removed from your cookbook.' });
  } catch (error) {
    console.error('Cookbook delete error:', error.message);
    return res.status(500).json({ error: 'Recipe could not be removed.' });
  }
});

module.exports = router;
