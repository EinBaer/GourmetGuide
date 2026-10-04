// Kapselt alle Zugriffe auf die externe Spoonacular REST-API
const SPOONACULAR_BASE = 'https://api.spoonacular.com';
// 27 auf einmal laden: "Show more" im Frontend kostet dann keine weiteren Punkte
const MAX_RESULTS = 27;
const NUTRIENTS = ['Calories', 'Protein', 'Fat', 'Carbohydrates'];

// Cache spart API-Punkte (Free Tier: 50 Punkte pro Tag)
// Spoonacular erlaubt Caching nur fuer maximal 1 Stunde
const CACHE_DURATION_MS = 60 * 60 * 1000;
const cache = new Map();

const readCache = (key) => {
  const entry = cache.get(key);
  if (!entry || Date.now() - entry.savedAt > CACHE_DURATION_MS) return null;
  return entry.data;
};

const writeCache = (key, data) => {
  cache.set(key, { data, savedAt: Date.now() });
  return data;
};

const requestSpoonacular = async (endpoint, params) => {
  const url = new URL(`${SPOONACULAR_BASE}${endpoint}`);
  Object.entries({ ...params, apiKey: process.env.SPOONACULAR_API_KEY })
    .forEach(([key, value]) => url.searchParams.set(key, value));

  const response = await fetch(url);
  if (response.status === 404) return null;
  if (!response.ok) {
    // Status merken, damit die Route z.B. das Tageslimit (402) erkennen kann
    const error = new Error(`Spoonacular antwortete mit Status ${response.status}`);
    error.status = response.status;
    throw error;
  }

  console.log('Spoonacular Punkte heute verbraucht:', response.headers.get('x-api-quota-used'));
  return response.json();
};

// MUST 5: Adapter von Spoonacular-Daten auf das approved Recipe Resource Model
const toRecipeModel = (recipe) => ({
  id: recipe.id,
  title: recipe.title,
  image: recipe.image || '',
  summary: recipe.summary || '',
  sourceName: recipe.sourceName || 'Unknown',
  servings: recipe.servings || 1,
  readyInMinutes: recipe.readyInMinutes || 0,
  pricePerServing: recipe.pricePerServing || 0,
  healthScore: recipe.healthScore || 0,
  vegetarian: Boolean(recipe.vegetarian),
  vegan: Boolean(recipe.vegan),
  glutenFree: Boolean(recipe.glutenFree)
});

// Zwei Modi: Gericht per Suchbegriff oder "Was hab ich da?" per Zutatenliste
const searchRecipes = async ({ query, ingredients, cuisine, diet, maxReadyTime }) => {
  const params = { number: MAX_RESULTS, addRecipeInformation: true };
  if (query) params.query = query;
  if (ingredients) {
    params.includeIngredients = ingredients.join(',');
    params.sort = 'max-used-ingredients';
    params.fillIngredients = true;
  }
  if (cuisine) params.cuisine = cuisine;
  if (diet) params.diet = diet;
  if (maxReadyTime) params.maxReadyTime = maxReadyTime;

  const cacheKey = `search:${JSON.stringify(params)}`;
  const cached = readCache(cacheKey);
  if (cached) return cached;

  const data = await requestSpoonacular('/recipes/complexSearch', params);
  return writeCache(cacheKey, (data?.results || []).map((recipe) => ({
    ...toRecipeModel(recipe),
    // Nur im Zutaten-Modus vorhanden: wie viele eigene Zutaten verwendet werden bzw. fehlen
    ...(ingredients && {
      usedIngredientCount: recipe.usedIngredientCount || 0,
      missedIngredientCount: recipe.missedIngredientCount || 0
    })
  })));
};

// Spoonacular schreibt Einheiten uneinheitlich (Tbsps, tablespoons, ...): auf eine Schreibweise bringen
const UNIT_NAMES = {
  tbsp: 'tbsp', tbsps: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp',
  tsp: 'tsp', tsps: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp',
  cup: 'cup', cups: 'cup'
};
// Loeffel und Cups sind keine metrischen Einheiten: im Metric-Modus in ml bzw. g umrechnen
const TBSP_PER_UNIT = { tbsp: 1, tsp: 1 / 3, cup: 16 };
const ML_PER_TBSP = 15;
// Feste Zutaten wiegt man in Gramm statt ml (Gramm pro Essloeffel)
const GRAMS_PER_TBSP = { butter: 14, sugar: 12.5, flour: 8, salt: 18 };

const toMeasure = (measure, ing, isMetric) => {
  // Fallback auf die Originalangabe, falls eine Masseinheit fehlt
  const amount = measure?.amount ?? ing.amount;
  const rawUnit = ((measure ? measure.unitShort : ing.unit) || '').toLowerCase();
  const unit = UNIT_NAMES[rawUnit] || rawUnit;
  if (isMetric && TBSP_PER_UNIT[unit]) {
    const tbsp = amount * TBSP_PER_UNIT[unit];
    const solid = Object.keys(GRAMS_PER_TBSP).find((name) => ing.name.toLowerCase().includes(name));
    return solid ? { amount: tbsp * GRAMS_PER_TBSP[solid], unit: 'g' } : { amount: tbsp * ML_PER_TBSP, unit: 'ml' };
  }
  return { amount, unit };
};

const getRecipeDetails = async (recipeId) => {
  const cacheKey = `details:${recipeId}`;
  const cached = readCache(cacheKey);
  if (cached) return cached;

  const recipe = await requestSpoonacular(`/recipes/${recipeId}/information`, { includeNutrition: true });
  if (!recipe) return null;

  const nutrients = recipe.nutrition?.nutrients || [];
  const details = {
    ...toRecipeModel(recipe),
    instructions: recipe.instructions || '',
    // Spoonacular-Bedingungen: die Originalquelle muss verlinkt werden
    sourceUrl: recipe.sourceUrl || '',
    // Spoonacular liefert jede Menge metrisch und amerikanisch: beide fuer den Umschalter speichern
    ingredients: (recipe.extendedIngredients || []).map((ing) => ({
      name: ing.name,
      metric: toMeasure(ing.measures?.metric, ing, true),
      us: toMeasure(ing.measures?.us, ing, false)
    })),
    // Naehrwerte pro Portion
    nutrition: nutrients
      .filter((nutrient) => NUTRIENTS.includes(nutrient.name))
      .map((nutrient) => ({ name: nutrient.name, amount: nutrient.amount, unit: nutrient.unit }))
  };

  return writeCache(cacheKey, details);
};

const getSubstitutes = async (ingredient) => {
  const cacheKey = `substitutes:${ingredient}`;
  const cached = readCache(cacheKey);
  if (cached) return cached;

  const data = await requestSpoonacular('/food/ingredients/substitutes', { ingredientName: ingredient });
  // Spoonacular meldet status 'failure', wenn keine Alternativen bekannt sind
  const substitutes = data?.status === 'success' ? data.substitutes || [] : [];

  return writeCache(cacheKey, substitutes);
};

module.exports = { searchRecipes, getRecipeDetails, getSubstitutes };
