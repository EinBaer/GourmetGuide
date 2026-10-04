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

// Liefert einen Vorschlag oder null, wenn nichts zu korrigieren ist
const suggestSearch = ({ query, ingredients }) => {
  const suggestion = ingredients
    ? ingredients.map((term) => closestWord(term, [...INGREDIENTS, ...Object.keys(GERMAN_TO_ENGLISH)])).join(', ')
    : closestWord(query, [...DISHES, ...INGREDIENTS]);
  const original = ingredients ? ingredients.join(', ') : query;
  return suggestion === original ? null : suggestion;
};

module.exports = { toEnglish };
