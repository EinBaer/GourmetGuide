const { readFile, writeFile } = require('fs').promises;
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const USERS_FILE_PATH = path.join(DATA_DIR, 'users.json');
const SAVED_RECIPES_FILE_PATH = path.join(DATA_DIR, 'savedRecipes.json');
const FEATURED_FILE_PATH = path.join(DATA_DIR, 'featuredRecipes.json');

const loadJsonFile = async (filePath, fallbackValue) => {
  try {
    const data = await readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    // Datei fehlt noch: Fallback statt Absturz, alle anderen Fehler weiterwerfen
    if (error.code === 'ENOENT') return fallbackValue;
    console.error(`Database read error at ${filePath}:`, error.message);
    throw error;
  }
};

const saveJsonFile = async (filePath, data) => {
  await writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
};

const loadUserDatabase = () => loadJsonFile(USERS_FILE_PATH, []);
const saveUserDatabase = (users) => saveJsonFile(USERS_FILE_PATH, users);

const loadRecipeDatabase = () => loadJsonFile(SAVED_RECIPES_FILE_PATH, []);
const saveRecipeDatabase = (recipes) => saveJsonFile(SAVED_RECIPES_FILE_PATH, recipes);

const loadFeaturedDatabase = () => loadJsonFile(FEATURED_FILE_PATH, []);
const saveFeaturedDatabase = (featured) => saveJsonFile(FEATURED_FILE_PATH, featured);

module.exports = {
  loadUserDatabase,
  saveUserDatabase,
  loadRecipeDatabase,
  saveRecipeDatabase,
  loadFeaturedDatabase,
  saveFeaturedDatabase
};
