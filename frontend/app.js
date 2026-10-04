// Frontend und API laufen auf demselben Origin (Express liefert beides aus)
const API_URL = '/api';
const TOKEN_KEY = 'gg_token';
const MAX_SERVINGS = 50;
const PAGE_SIZE = 9;
const MAX_SUBSTITUTES = 3;

// Texte fuer die zwei Suchmodi
const SEARCH_MODES = {
  dish: {
    placeholder: 'e.g. lasagna, curry, pancakes',
    hint: 'Tip: type a dish in English, e.g. "risotto".'
  },
  ingredients: {
    placeholder: 'e.g. rice, chicken, bell pepper',
    hint: 'Separate ingredients with commas. English and German both work, e.g. "Reis, Hähnchen, Paprika".'
  }
};

// DOM-Elemente cachen
const authPanel = document.querySelector('#authPanel');
const authForm = document.querySelector('#authForm');
const authTitle = document.querySelector('#authTitle');
const authSubmitButton = document.querySelector('#authSubmitButton');
const authSwitch = document.querySelector('#authSwitch');
const authMessage = document.querySelector('#authMessage');
const guestButton = document.querySelector('#guestButton');
const nameLabel = document.querySelector('#nameLabel');
const nameInput = document.querySelector('#nameInput');
const usernameInput = document.querySelector('#usernameInput');
const passwordInput = document.querySelector('#passwordInput');
const userName = document.querySelector('#userName');
const loginButton = document.querySelector('#loginButton');
const logoutButton = document.querySelector('#logoutButton');
const userMenu = document.querySelector('#userMenu');
const accountButton = document.querySelector('#accountButton');
const accountMenu = document.querySelector('#accountMenu');

const dashboard = document.querySelector('#dashboard');
const tabNav = document.querySelector('#tabNav');
const tabButtons = document.querySelectorAll('.tab-button');
const tabs = {
  search: document.querySelector('#searchTab'),
  cookbook: document.querySelector('#cookbookTab'),
  admin: document.querySelector('#adminTab')
};

const featuredSection = document.querySelector('#featuredSection');
const featuredList = document.querySelector('#featuredList');
const searchForm = document.querySelector('#searchForm');
const searchModeInputs = document.querySelectorAll('input[name="searchMode"]');
const searchInput = document.querySelector('#searchInput');
const searchHint = document.querySelector('#searchHint');
const cuisineSelect = document.querySelector('#cuisineSelect');
const dietSelect = document.querySelector('#dietSelect');
const timeSelect = document.querySelector('#timeSelect');
const searchResults = document.querySelector('#searchResults');
const showMoreButton = document.querySelector('#showMoreButton');

const cookbookList = document.querySelector('#cookbookList');
const cookbookEmpty = document.querySelector('#cookbookEmpty');
const userTableBody = document.querySelector('#userTableBody');
const adminFeaturedList = document.querySelector('#adminFeaturedList');

const recipeModal = document.querySelector('#recipeModal');
const modalClose = document.querySelector('#modalClose');
const modalBody = document.querySelector('#modalBody');

let authMode = 'login';
let currentUser = null;
let currentToken = null;
let cookbookEntries = [];
let foundRecipes = [];
let shownCount = 0;
let unitSystem = 'metric';
let currentServings = 0;

// Zentraler fetch-Helper: haengt das JWT an und wirft bei Fehlern die Server-Meldung
const requestJson = async (path, options = {}) => {
  const headers = { 'Content-Type': 'application/json' };
  if (currentToken) headers.Authorization = `Bearer ${currentToken}`;

  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));

  // Abgelaufenes Token: automatisch ausloggen
  if (response.status === 401 && currentToken) setLoggedOut();
  if (!response.ok) throw new Error(data.error || `Request failed (status ${response.status}).`);
  return data;
};

// XSS-Schutz: Sonderzeichen escapen, bevor Daten per innerHTML ins DOM kommen
const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

// HTML-Tags aus Spoonacular-Texten entfernen, DOMParser fuehrt dabei nichts aus
const stripHtml = (html) => new DOMParser().parseFromString(html || '', 'text/html').body.textContent || '';

// Unter 10 eine Nachkommastelle (2.5 lb), ab 10 ganze Zahlen (771 g)
const formatAmount = (value) => (value < 10 ? Math.round(value * 10) / 10 : Math.round(value));

const formatDate = (isoString) => new Date(isoString).toLocaleDateString('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric'
});

const createDietTags = (recipe) => {
  let tags = '';
  if (recipe.vegetarian) tags += '<span class="diet-tag">Vegetarian</span>';
  if (recipe.vegan) tags += '<span class="diet-tag">Vegan</span>';
  if (recipe.glutenFree) tags += '<span class="diet-tag">Gluten-free</span>';
  return tags;
};

const findCookbookEntry = (recipeId) => cookbookEntries.find((entry) => entry.recipeId === recipeId);

const getSearchMode = () => document.querySelector('input[name="searchMode"]:checked').value;

// ---------- Login, Logout, Gast-Modus ----------

const showAuthPanel = (show) => {
  authPanel.hidden = !show;
  dashboard.hidden = show;
  tabNav.hidden = show;
  loginButton.hidden = show || Boolean(currentUser);
  authMessage.textContent = '';
};

const toggleAccountMenu = (open) => {
  accountMenu.hidden = !open;
  accountButton.setAttribute('aria-expanded', String(open));
};

const setLoggedIn = async (user, token) => {
  currentUser = user;
  currentToken = token;
  localStorage.setItem(TOKEN_KEY, token);

  userName.textContent = user.username;
  userMenu.hidden = false;
  document.querySelector('[data-tab="cookbook"]').hidden = false;
  document.querySelector('[data-tab="admin"]').hidden = user.role !== 'admin';

  showAuthPanel(false);
  switchTab('search');
  await loadCookbook();
};

// Gast-Modus: Feature 1 (Discovery) bleibt nutzbar, Kochbuch und Admin werden ausgeblendet
const setLoggedOut = () => {
  currentUser = null;
  currentToken = null;
  cookbookEntries = [];
  localStorage.removeItem(TOKEN_KEY);

  userName.textContent = '';
  userMenu.hidden = true;
  toggleAccountMenu(false);
  document.querySelector('[data-tab="cookbook"]').hidden = true;
  document.querySelector('[data-tab="admin"]').hidden = true;

  closeModal();
  showAuthPanel(false);
  switchTab('search');
};

const toggleAuthMode = () => {
  authMode = authMode === 'login' ? 'register' : 'login';
  const isLogin = authMode === 'login';

  authTitle.textContent = isLogin ? 'Log in' : 'Create an account';
  authSubmitButton.textContent = isLogin ? 'Log in' : 'Sign up';
  authSwitch.textContent = isLogin ? 'No account yet? Sign up' : 'Already have an account? Log in';
  nameLabel.hidden = isLogin;
  nameInput.required = !isLogin;
  passwordInput.autocomplete = isLogin ? 'current-password' : 'new-password';
  authMessage.textContent = '';
};

// ---------- Tabs ----------

const switchTab = (tabName) => {
  tabButtons.forEach((button) => button.classList.toggle('active', button.dataset.tab === tabName));
  Object.entries(tabs).forEach(([name, element]) => {
    element.hidden = name !== tabName;
  });

  if (tabName === 'search') loadFeatured();
  if (tabName === 'cookbook') loadCookbook();
  if (tabName === 'admin') loadAdmin();
};

const getCardMeta = (recipe) => {
  if (recipe.dateAdded) {
    const ratingText = recipe.rating ? `${recipe.rating}/5 stars` : 'Not rated yet';
    return `Saved ${formatDate(recipe.dateAdded)} | ${ratingText}`;
  }
  // Zutaten-Modus: zeigt, wie gut das Rezept zu den eigenen Zutaten passt
  if (recipe.usedIngredientCount !== undefined) {
    return `Uses ${recipe.usedIngredientCount} of your ingredients | ${recipe.missedIngredientCount} missing`;
  }
  return `Health score ${recipe.healthScore}/100`;
};

const createRecipeCard = (recipe) => {
  const card = document.createElement('article');
  card.className = 'recipe-card';

  // Kochbuch-Eintraege speichern keine Zeit, dort gibt es kein Badge
  const timeBadge = recipe.readyInMinutes ? `<span class="time-badge">${recipe.readyInMinutes} min</span>` : '';

  card.innerHTML = `
    <div class="card-media">
      ${recipe.image
      ? `<img src="${escapeHtml(recipe.image)}" alt="" loading="lazy">`
      : '<div class="image-placeholder" aria-hidden="true"></div>'}
      ${timeBadge}
    </div>
    <div class="recipe-card-body">
      <h3><button class="card-link" type="button">${escapeHtml(recipe.title)}</button></h3>
      <p class="recipe-card-meta">${escapeHtml(getCardMeta(recipe))}</p>
      <div class="diet-tags">${createDietTags(recipe)}</div>
    </div>
  `;

  // Kochbuch-Eintraege haben eine eigene UUID, die Spoonacular-ID steht in recipeId
  const spoonacularId = recipe.recipeId || recipe.id;
  card.querySelector('.card-link').addEventListener('click', () => openRecipeDetail(spoonacularId));
  return card;
};

const renderRecipes = (container, recipes) => {
  container.innerHTML = '';
  recipes.forEach((recipe) => container.append(createRecipeCard(recipe)));
};

// Zeigt die naechsten 9 Suchergebnisse aus dem Speicher (kein neuer API-Aufruf)
const showNextRecipes = () => {
  foundRecipes.slice(shownCount, shownCount + PAGE_SIZE)
    .forEach((recipe) => searchResults.append(createRecipeCard(recipe)));
  shownCount += PAGE_SIZE;
  showMoreButton.hidden = shownCount >= foundRecipes.length;
};

// ---------- Daten laden ----------

const loadFeatured = async () => {
  try {
    const data = await requestJson('/recipes/featured');
    renderRecipes(featuredList, data.featured);
    // Ohne Empfehlungen bleibt der ganze Bereich weg statt eines leeren Kastens
    featuredSection.hidden = data.featured.length === 0;
  } catch (error) {
    console.error('Featured load error:', error.message);
  }
};

const loadCookbook = async () => {
  if (!currentUser) return;
  try {
    const data = await requestJson('/recipes/cookbook');
    cookbookEntries = data.recipes;
    renderRecipes(cookbookList, cookbookEntries);
    cookbookEmpty.hidden = cookbookEntries.length > 0;
  } catch (error) {
    console.error('Cookbook load error:', error.message);
  }
};

const loadAdmin = async () => {
  if (currentUser?.role !== 'admin') return;
  try {
    const [userData, featuredData] = await Promise.all([
      requestJson('/admin/users'),
      requestJson('/recipes/featured')
    ]);
    renderUserTable(userData.users);
    renderAdminFeatured(featuredData.featured);
  } catch (error) {
    console.error('Admin load error:', error.message);
  }
};

// ---------- Feature 3: Administration ----------

const renderUserTable = (users) => {
  userTableBody.innerHTML = '';

  users.forEach((user) => {
    // Eigener Account und Haupt-Admin sind gesperrt
    const isLocked = user.id === currentUser.id || user.isOwner;
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${escapeHtml(user.name)}</td>
      <td>${escapeHtml(user.username)}</td>
      <td>
        <select class="role-select" aria-label="Role of ${escapeHtml(user.username)}" ${isLocked ? 'disabled' : ''}>
          <option value="user" ${user.role === 'user' ? 'selected' : ''}>User</option>
          <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
        </select>
      </td>
      <td>${formatDate(user.createdAt)}</td>
      <td><button class="danger-button" type="button" ${isLocked ? 'disabled' : ''}>Delete</button></td>
    `;

    row.querySelector('.role-select').addEventListener('change', async (event) => {
      try {
        await requestJson(`/admin/users/${user.id}/role`, {
          method: 'PUT',
          body: JSON.stringify({ role: event.target.value })
        });
      } catch (error) {
        alert(error.message);
        loadAdmin();
      }
    });

    row.querySelector('.danger-button').addEventListener('click', async () => {
      if (!confirm(`Delete user "${user.username}" and their cookbook?`)) return;
      try {
        await requestJson(`/admin/users/${user.id}`, { method: 'DELETE' });
        row.remove();
      } catch (error) {
        alert(error.message);
      }
    });

    userTableBody.append(row);
  });
};

const renderAdminFeatured = (featured) => {
  adminFeaturedList.innerHTML = featured.length ? '' : '<li class="status">No featured recipes yet.</li>';

  featured.forEach((entry) => {
    const item = document.createElement('li');
    item.innerHTML = `<span>${escapeHtml(entry.title)}</span><button class="danger-button" type="button">Remove</button>`;
    item.querySelector('button').addEventListener('click', async () => {
      try {
        await requestJson(`/admin/featured/${entry.recipeId}`, { method: 'DELETE' });
        loadAdmin();
      } catch (error) {
        alert(error.message);
      }
    });
    adminFeaturedList.append(item);
  });
};

// ---------- Detailansicht (Feature 1 + 2 + 3) ----------

const closeModal = () => {
  recipeModal.hidden = true;
  modalBody.innerHTML = '';
};

const openRecipeDetail = async (recipeId) => {
  modalBody.innerHTML = '<p class="status">Loading recipe...</p>';
  recipeModal.hidden = false;

  try {
    const recipe = await requestJson(`/recipes/details/${recipeId}`);
    // Spoonacular liefert den Preis in US-Cent
    const pricePerServing = (recipe.pricePerServing / 100).toFixed(2);
    // Nur echte Web-Links verlinken (kein javascript: o.ae.)
    const sourceHtml = (recipe.sourceUrl || '').startsWith('http')
      ? `<a href="${escapeHtml(recipe.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(recipe.sourceName)}</a>`
      : escapeHtml(recipe.sourceName);

    modalBody.innerHTML = `
      ${recipe.image ? `<img class="detail-image" src="${escapeHtml(recipe.image)}" alt="">` : ''}
      <div class="detail-header">
        <h2 id="modalTitle">${escapeHtml(recipe.title)}</h2>
        <ul class="detail-chips">
          <li>${recipe.readyInMinutes} min</li>
          <li>${recipe.servings} servings</li>
          <li>Health ${recipe.healthScore}/100</li>
          <li>$${pricePerServing} per serving</li>
        </ul>
        <div class="diet-tags">${createDietTags(recipe)}</div>
        <p class="detail-meta">Source: ${sourceHtml}</p>
      </div>
      <div id="userActions"></div>
      <section class="detail-section">
        <h3>About this dish</h3>
        <p>${escapeHtml(stripHtml(recipe.summary))}</p>
      </section>
      <section class="detail-section">
        <div class="section-header">
          <h3>Ingredients</h3>
          <label class="unit-switch">
            Metric
            <input id="unitSwitch" type="checkbox" role="switch" ${unitSystem === 'us' ? 'checked' : ''}>
            <span class="switch-track" aria-hidden="true"></span>
            US
          </label>
        </div>
        <div id="portionControls"></div>
        <ul id="ingredientList" class="ingredient-list"></ul>
      </section>
      <section class="detail-section">
        <h3 id="nutritionTitle">Nutrition</h3>
        <ul id="nutritionList" class="nutrition-list"></ul>
      </section>
      <section class="detail-section">
        <h3>Instructions</h3>
        <p>${escapeHtml(stripHtml(recipe.instructions)) || 'No instructions available.'}</p>
      </section>
    `;

    renderPortions(recipe, recipe.servings);

    // Umschalter Metric/US: nur neu rendern, die Daten sind schon da (keine API-Punkte)
    modalBody.querySelector('#unitSwitch').addEventListener('change', (event) => {
      unitSystem = event.target.checked ? 'us' : 'metric';
      renderPortions(recipe, currentServings);
      const baseIngredientSelect = modalBody.querySelector('#baseIngredientSelect');
      if (baseIngredientSelect) baseIngredientSelect.innerHTML = createIngredientOptions(recipe, baseIngredientSelect.value);
    });

    if (currentUser) {
      setupPortionCalculator(recipe);
      renderUserActions(recipe);
    }
  } catch (error) {
    modalBody.innerHTML = `<p class="status">${escapeHtml(error.message)}</p>`;
  }
};

// Portionsrechner: alle Mengen mit demselben Faktor skalieren (rein clientseitig, kostet keine API-Punkte)
const renderPortions = (recipe, servings) => {
  currentServings = servings;
  const factor = servings / recipe.servings;
  const substituteButton = currentUser ? '<button class="link-button substitute-button" type="button">Substitutes</button>' : '';


  modalBody.querySelector('#ingredientList').innerHTML = recipe.ingredients.map((ing) => {
    const measure = ing[unitSystem];
    // Einheit weglassen, wenn es keine gibt
    const amount = formatAmount(measure.amount * factor);
    const amountText = measure.unit ? `${amount} ${measure.unit}` : `${amount}`;
    return `
      <li data-ingredient="${escapeHtml(ing.name)}">
        <span><strong>${escapeHtml(amountText)}</strong> ${escapeHtml(ing.name)}</span>
        ${substituteButton}
      </li>
    `;
  }).join('') || '<li>No ingredients available.</li>';

  const servingLabel = servings === 1 ? 'serving' : 'servings';
  modalBody.querySelector('#nutritionTitle').textContent = `Nutrition for ${formatAmount(servings)} ${servingLabel}`;
  modalBody.querySelector('#nutritionList').innerHTML = recipe.nutrition.map((nutrient) => `
    <li><strong>${escapeHtml(nutrient.name)}</strong> ${Math.round(nutrient.amount * servings)} ${escapeHtml(nutrient.unit)}</li>
  `).join('') || '<li>No nutrition data available.</li>';
};

const createIngredientOptions = (recipe, selectedIndex = '0') => recipe.ingredients
  .map((ing, index) => {
    const unit = escapeHtml(ing[unitSystem].unit) || 'pcs';
    const selected = String(index) === selectedIndex ? 'selected' : '';
    return `<option value="${index}" ${selected}>${escapeHtml(ing.name)} (${unit})</option>`;
  })
  .join('');

// "1 tbsp = 3/4 tsp salt + ..." -> Text und kurzer Hinweis, fuer welche Menge der Ersatz gilt
const formatSubstitute = (raw) => {
  const [left, right] = raw.split(' = ');
  if (!right) return { text: raw.trim(), note: '' };
  if (right.toLowerCase().startsWith(left.toLowerCase())) {
    return { text: right.slice(left.length).trim(), note: 'same amount' };
  }
  return { text: right.trim(), note: `per ${left.trim()}` };
};

const createSubstituteBox = (substitutes, emptyText = 'No substitutes known for this ingredient.') => {
  // Doppelte Vorschlaege entfernen, hoechstens MAX_SUBSTITUTES anzeigen
  const unique = [];
  substitutes.map(formatSubstitute).forEach((entry) => {
    const exists = unique.some((saved) => saved.text.toLowerCase() === entry.text.toLowerCase());
    if (!exists && unique.length < MAX_SUBSTITUTES) unique.push(entry);
  });

  const box = document.createElement('div');
  box.className = 'substitute-box';
  box.innerHTML = unique.length
    ? `<p class="substitute-title">Swap with</p>
       <ul>${unique.map((entry) => `<li><span>${escapeHtml(entry.text)}</span><small>${escapeHtml(entry.note)}</small></li>`).join('')}</ul>`
    : `<p class="substitute-title">${escapeHtml(emptyText)}</p>`;
  return box;
};

const setupPortionCalculator = (recipe) => {
  const controls = modalBody.querySelector('#portionControls');

  controls.className = 'portion-controls';
  controls.innerHTML = `
    <label>Servings <input id="servingsInput" type="number" min="1" max="${MAX_SERVINGS}" value="${recipe.servings}"></label>
    <label>or I have <input id="availableInput" type="number" min="0.1" step="0.1" placeholder="e.g. 200"></label>
    <label>of <select id="baseIngredientSelect">${createIngredientOptions(recipe)}</select></label>
  `;

  const servingsInput = controls.querySelector('#servingsInput');
  const availableInput = controls.querySelector('#availableInput');
  const baseIngredientSelect = controls.querySelector('#baseIngredientSelect');

  // Modus 1: gewuenschte Portionen (Boundary Case: nur ganze Zahlen von 1 bis MAX_SERVINGS)
  servingsInput.addEventListener('input', () => {
    const servings = Number(servingsInput.value);
    if (Number.isInteger(servings) && servings >= 1 && servings <= MAX_SERVINGS) {
      availableInput.value = '';
      renderPortions(recipe, servings);
    }
  });

  // Modus 2: Portionen aus der vorhandenen Menge einer Zutat berechnen (Dreisatz)
  const recalculateFromIngredient = () => {
    const ingredient = recipe.ingredients[Number(baseIngredientSelect.value)];
    const available = Number(availableInput.value);
    if (!ingredient || ingredient[unitSystem].amount <= 0 || available <= 0) return;

    const servings = (available / ingredient[unitSystem].amount) * recipe.servings;
    servingsInput.value = formatAmount(servings);
    renderPortions(recipe, servings);
  };
  availableInput.addEventListener('input', recalculateFromIngredient);
  baseIngredientSelect.addEventListener('change', recalculateFromIngredient);

  // Smart Substitutions: Event Delegation, weil die Liste bei jeder Portionsaenderung neu gerendert wird
  modalBody.querySelector('#ingredientList').addEventListener('click', async (event) => {
    const button = event.target.closest('.substitute-button');
    if (!button) return;

    // Zweiter Klick klappt die Liste wieder zu
    const item = button.closest('li');
    const openBox = item.querySelector('.substitute-box');
    if (openBox) {
      openBox.remove();
      button.textContent = 'Substitutes';
      return;
    }

    button.disabled = true;
    try {
      const data = await requestJson(`/recipes/substitutes?ingredient=${encodeURIComponent(item.dataset.ingredient)}`);
      item.append(createSubstituteBox(data.substitutes));
    } catch (error) {
      // Fehler direkt unter der Zutat statt als Popup
      item.append(createSubstituteBox([], error.message));
    } finally {
      button.textContent = 'Hide';
      button.disabled = false;
    }
  });
};

// Speichern bzw. Bewerten und Notizen (User) sowie Empfehlen (Admin)
const renderUserActions = (recipe) => {
  const container = modalBody.querySelector('#userActions');
  const entry = findCookbookEntry(recipe.id);
  container.className = 'user-actions';

  if (!entry) {
    container.innerHTML = '<button id="saveButton" type="button">Save to my cookbook</button>';
    container.querySelector('#saveButton').addEventListener('click', async () => {
      try {
        await requestJson('/recipes/cookbook', {
          method: 'POST',
          body: JSON.stringify({ recipeId: recipe.id, title: recipe.title, image: recipe.image })
        });
        await loadCookbook();
        renderUserActions(recipe);
      } catch (error) {
        alert(error.message);
      }
    });
  } else {
    renderCookbookActions(container, recipe, entry);
  }

  if (currentUser.role === 'admin') {
    const featureButton = document.createElement('button');
    featureButton.type = 'button';
    featureButton.className = 'secondary-button';
    featureButton.textContent = "Add to Chef's Picks";
    featureButton.addEventListener('click', async () => {
      featureButton.disabled = true;
      try {
        await requestJson('/admin/featured', { method: 'POST', body: JSON.stringify({ recipeId: recipe.id }) });
        featureButton.textContent = "Added to Chef's Picks";
        loadFeatured();
      } catch (error) {
        featureButton.textContent = error.message;
      }
    });
    container.append(featureButton);
  }
};

const renderCookbookActions = (container, recipe, entry) => {
  const stars = [1, 2, 3, 4, 5].map((star) => `
    <button class="star-button ${star <= entry.rating ? 'filled' : ''}" type="button" data-star="${star}" aria-label="${star} of 5 stars">${star <= entry.rating ? '★' : '☆'}</button>
  `).join('');

  container.innerHTML = `
    <p class="saved-info">In your cookbook since ${formatDate(entry.dateAdded)}</p>
    <div class="rating-stars" role="group" aria-label="Your rating">${stars}</div>
    <label class="notes-label">My notes
      <textarea id="notesArea" rows="3" maxlength="1000" placeholder="e.g. add more garlic next time">${escapeHtml(entry.notes)}</textarea>
    </label>
    <div class="button-row">
      <button id="saveNotesButton" type="button">Save notes</button>
      <button id="removeButton" class="danger-button" type="button">Remove from cookbook</button>
    </div>
  `;

  const updateEntry = (changes) => requestJson(`/recipes/cookbook/${entry.id}`, {
    method: 'PUT',
    body: JSON.stringify(changes)
  });

  container.querySelector('.rating-stars').addEventListener('click', async (event) => {
    const starButton = event.target.closest('.star-button');
    if (!starButton) return;
    try {
      const data = await updateEntry({ rating: Number(starButton.dataset.star) });
      Object.assign(entry, data.recipe);
      renderUserActions(recipe);
      loadCookbook();
    } catch (error) {
      alert(error.message);
    }
  });

  const saveNotesButton = container.querySelector('#saveNotesButton');
  saveNotesButton.addEventListener('click', async () => {
    try {
      const data = await updateEntry({ notes: container.querySelector('#notesArea').value });
      Object.assign(entry, data.recipe);
      saveNotesButton.textContent = 'Saved!';
      setTimeout(() => { saveNotesButton.textContent = 'Save notes'; }, 1500);
    } catch (error) {
      alert(error.message);
    }
  });

  container.querySelector('#removeButton').addEventListener('click', async () => {
    if (!confirm(`Remove "${recipe.title}" from your cookbook?`)) return;
    try {
      await requestJson(`/recipes/cookbook/${entry.id}`, { method: 'DELETE' });
      await loadCookbook();
      renderUserActions(recipe);
    } catch (error) {
      alert(error.message);
    }
  });
};

// ---------- Event Listener ----------

authForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  authMessage.textContent = '';

  const body = { username: usernameInput.value, password: passwordInput.value };
  if (authMode === 'register') body.name = nameInput.value;

  authSubmitButton.disabled = true;
  try {
    const data = await requestJson(`/auth/${authMode}`, { method: 'POST', body: JSON.stringify(body) });
    authForm.reset();
    await setLoggedIn(data.user, data.token);
  } catch (error) {
    authMessage.textContent = error.message;
  } finally {
    authSubmitButton.disabled = false;
  }
});

// Placeholder und Hinweis passend zum Suchmodus anzeigen
searchModeInputs.forEach((input) => input.addEventListener('change', () => {
  const mode = SEARCH_MODES[getSearchMode()];
  searchInput.placeholder = mode.placeholder;
  searchHint.textContent = mode.hint;
  searchInput.focus();
}));

searchForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const paramName = getSearchMode() === 'ingredients' ? 'ingredients' : 'q';
  const params = new URLSearchParams({ [paramName]: searchInput.value.trim() });
  if (cuisineSelect.value) params.set('cuisine', cuisineSelect.value);
  if (dietSelect.value) params.set('diet', dietSelect.value);
  if (timeSelect.value) params.set('maxReadyTime', timeSelect.value);

  const submitButton = searchForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  showMoreButton.hidden = true;
  searchResults.innerHTML = '<p class="status">Searching...</p>';

  try {
    const data = await requestJson(`/recipes/search?${params}`);
    foundRecipes = data.results;
    shownCount = 0;
    searchResults.innerHTML = '';
    showNextRecipes();
    if (!foundRecipes.length) {
      searchResults.innerHTML = '<p class="status">No recipes found. Try fewer filters or another term.</p>';
    }
  } catch (error) {
    searchResults.innerHTML = `<p class="status">${escapeHtml(error.message)}</p>`;
  } finally {
    submitButton.disabled = false;
  }
});

showMoreButton.addEventListener('click', showNextRecipes);

authSwitch.addEventListener('click', toggleAuthMode);
loginButton.addEventListener('click', () => showAuthPanel(true));
guestButton.addEventListener('click', () => showAuthPanel(false));
logoutButton.addEventListener('click', setLoggedOut);
tabButtons.forEach((button) => button.addEventListener('click', () => switchTab(button.dataset.tab)));

accountButton.addEventListener('click', () => toggleAccountMenu(accountMenu.hidden));
// Klick ausserhalb schliesst das Account-Menue
document.addEventListener('click', (event) => {
  if (!userMenu.contains(event.target)) toggleAccountMenu(false);
});

modalClose.addEventListener('click', closeModal);
recipeModal.addEventListener('click', (event) => {
  if (event.target === recipeModal) closeModal();
});
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (!recipeModal.hidden) closeModal();
  toggleAccountMenu(false);
});

// ---------- App-Start ----------

// Gespeichertes Token vom Server pruefen lassen (abgelaufen? Rolle geaendert?)
const initApp = async () => {
  const savedToken = localStorage.getItem(TOKEN_KEY);
  if (!savedToken) {
    setLoggedOut();
    return;
  }

  currentToken = savedToken;
  try {
    const data = await requestJson('/auth/me');
    await setLoggedIn(data.user, savedToken);
  } catch (error) {
    setLoggedOut();
  }
};

initApp();
