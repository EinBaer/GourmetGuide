// Spoonacular versteht nur Englisch: deutsche Zutaten werden vor der Suche uebersetzt
// Schluessel ohne Umlaute, weil die Eingabe vorher normalisiert wird (ae, oe, ue, ss)
const GERMAN_TO_ENGLISH = {
  reis: 'rice',
  nudeln: 'pasta',
  spaghetti: 'spaghetti',
  kartoffel: 'potato',
  kartoffeln: 'potatoes',
  brot: 'bread',
  mehl: 'flour',
  haferflocken: 'oats',
  huhn: 'chicken',
  haehnchen: 'chicken',
  haehnchenbrust: 'chicken breast',
  pute: 'turkey',
  rind: 'beef',
  rindfleisch: 'beef',
  hackfleisch: 'ground beef',
  schwein: 'pork',
  schweinefleisch: 'pork',
  speck: 'bacon',
  schinken: 'ham',
  wurst: 'sausage',
  lachs: 'salmon',
  thunfisch: 'tuna',
  fisch: 'fish',
  garnelen: 'shrimp',
  ei: 'egg',
  eier: 'eggs',
  milch: 'milk',
  sahne: 'cream',
  butter: 'butter',
  kaese: 'cheese',
  joghurt: 'yogurt',
  quark: 'quark',
  tofu: 'tofu',
  zwiebel: 'onion',
  zwiebeln: 'onions',
  knoblauch: 'garlic',
  tomate: 'tomato',
  tomaten: 'tomatoes',
  paprika: 'bell pepper',
  karotte: 'carrot',
  karotten: 'carrots',
  gurke: 'cucumber',
  zucchini: 'zucchini',
  aubergine: 'eggplant',
  brokkoli: 'broccoli',
  blumenkohl: 'cauliflower',
  spinat: 'spinach',
  salat: 'lettuce',
  pilze: 'mushrooms',
  champignons: 'mushrooms',
  mais: 'corn',
  erbsen: 'peas',
  bohnen: 'beans',
  linsen: 'lentils',
  kichererbsen: 'chickpeas',
  avocado: 'avocado',
  apfel: 'apple',
  aepfel: 'apples',
  banane: 'banana',
  bananen: 'bananas',
  zitrone: 'lemon',
  erdbeeren: 'strawberries',
  heidelbeeren: 'blueberries',
  zucker: 'sugar',
  honig: 'honey',
  schokolade: 'chocolate',
  nuesse: 'nuts',
  mandeln: 'almonds',
  olivenoel: 'olive oil',
  ingwer: 'ginger',
  basilikum: 'basil',
  petersilie: 'parsley',
  zimt: 'cinnamon'
};

// "Hähnchen " -> "haehnchen" -> "chicken"; unbekannte Begriffe bleiben unveraendert
const toEnglish = (term) => {
  const normalized = term.trim().toLowerCase()
    .replaceAll('ä', 'ae')
    .replaceAll('ö', 'oe')
    .replaceAll('ü', 'ue')
    .replaceAll('ß', 'ss');
  return GERMAN_TO_ENGLISH[normalized] || normalized;
};

// ---------- Rechtschreibhilfe "Did you mean ...?" ----------

const DISHES = [
  'lasagna', 'risotto', 'curry', 'pancakes', 'pizza', 'burger', 'tacos', 'burrito', 'paella', 'ramen',
  'sushi', 'pad thai', 'schnitzel', 'goulash', 'carbonara', 'bolognese', 'chili', 'soup', 'salad', 'omelette',
  'quiche', 'falafel', 'hummus', 'tiramisu', 'brownies', 'cheesecake', 'gnocchi', 'moussaka', 'biryani',
  'butter chicken', 'pho', 'enchiladas', 'meatballs', 'fried rice', 'apple pie', 'banana bread'
];
const INGREDIENTS = [...new Set(Object.values(GERMAN_TO_ENGLISH))];
// Hoechstens 2 Tippfehler, bei kurzen Woertern weniger (1 Fehler pro 3 Buchstaben)
const MAX_TYPOS = 2;

// Levenshtein-Distanz: wie viele Buchstaben muss man einfuegen, loeschen oder tauschen
const distance = (a, b) => {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length];
};

// Aehnlichstes bekanntes Wort, deutsche Treffer werden gleich uebersetzt
const closestWord = (term, words) => {
  const best = words.reduce((winner, word) => (distance(term, word) < distance(term, winner) ? word : winner));
  if (distance(term, best) > Math.min(MAX_TYPOS, Math.floor(term.length / 3))) return term;
  return GERMAN_TO_ENGLISH[best] || best;
};

// Liefert einen Vorschlag oder null, wenn nichts zu korrigieren ist
const suggestSearch = ({ query, ingredients }) => {
  const suggestion = ingredients
    ? ingredients.map((term) => closestWord(term, [...INGREDIENTS, ...Object.keys(GERMAN_TO_ENGLISH)])).join(', ')
    : closestWord(query, [...DISHES, ...INGREDIENTS]);
  const original = ingredients ? ingredients.join(', ') : query;
  return suggestion === original ? null : suggestion;
};

module.exports = { toEnglish, suggestSearch };
