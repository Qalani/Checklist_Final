/** Sections used when automatically grouping a grocery list. */
export const GROCERY_CATEGORIES = [
  'Produce',
  'Bread & Bakery',
  'Dairy & Eggs',
  'Meat & Seafood',
  'Deli',
  'Frozen Foods',
  'Pantry',
  'Snacks & Candy',
  'Beverages',
  'Household',
  'Personal Care',
  'Pet Care',
  'Other',
] as const;

export type GroceryCategory = (typeof GROCERY_CATEGORIES)[number];

type GroceryRule = { category: GroceryCategory; terms: readonly string[] };

// Specific phrases take precedence over shorter matches (e.g. "chicken broth"
// belongs in Pantry, even though "chicken" alone belongs in Meat & Seafood).
const RULES: readonly GroceryRule[] = [
  { category: 'Produce', terms: [
    'apple', 'apricot', 'artichoke', 'arugula', 'asparagus', 'avocado', 'banana',
    'basil', 'bell pepper', 'blackberry', 'blueberry', 'bok choy', 'broccoli',
    'brussels sprout', 'cabbage', 'cantaloupe', 'carrot', 'cauliflower', 'celery',
    'cherry', 'cilantro', 'clementine', 'corn', 'cucumber', 'eggplant', 'garlic',
    'ginger', 'grape', 'grapefruit', 'green bean', 'green onion', 'herb', 'jalapeno',
    'kale', 'kiwi', 'leek', 'lemon', 'lettuce', 'lime', 'mango', 'melon', 'mushroom',
    'nectarine', 'onion', 'orange', 'parsley', 'peach', 'pear', 'pepper', 'pineapple',
    'plum', 'potato', 'raspberry', 'salad greens', 'scallion', 'spinach', 'squash',
    'strawberry', 'sweet potato', 'tomato', 'watermelon', 'yam', 'zucchini',
  ] },
  { category: 'Bread & Bakery', terms: [
    'bagel', 'baguette', 'bread', 'bun', 'croissant', 'donut', 'english muffin',
    'muffin', 'pita', 'roll', 'tortilla',
  ] },
  { category: 'Dairy & Eggs', terms: [
    'almond milk', 'butter', 'cheese', 'cottage cheese', 'cream', 'cream cheese',
    'egg', 'half and half', 'milk', 'oat milk', 'sour cream', 'soy milk', 'yogurt',
    'yoghurt',
  ] },
  { category: 'Meat & Seafood', terms: [
    'bacon', 'beef', 'chicken', 'cod', 'crab', 'fish', 'ground beef', 'ground turkey',
    'ham', 'lamb', 'lobster', 'pork', 'prawn', 'salmon', 'sausage', 'shrimp', 'steak',
    'tilapia', 'tuna', 'turkey',
  ] },
  { category: 'Deli', terms: [
    'deli meat', 'deli turkey', 'hummus', 'lunch meat', 'salami',
  ] },
  { category: 'Frozen Foods', terms: [
    'frozen', 'frozen berries', 'frozen chicken', 'frozen fruit', 'frozen pizza',
    'frozen vegetables', 'ice cream', 'ice pops', 'popsicle',
  ] },
  { category: 'Pantry', terms: [
    'baking powder', 'baking soda', 'beans', 'broth', 'canned beans', 'canned corn',
    'canned tomatoes', 'canned tuna', 'cereal', 'chicken broth', 'chicken stock',
    'chickpea', 'coconut milk', 'cooking oil', 'flour', 'honey', 'jam', 'jelly',
    'ketchup', 'lentil', 'mayonnaise', 'mustard', 'noodle', 'oatmeal', 'olive oil',
    'pasta', 'pasta sauce', 'peanut butter', 'rice', 'salt', 'sauce', 'soup',
    'soy sauce', 'spice', 'stock', 'sugar', 'syrup', 'tomato sauce', 'tomato soup',
    'vanilla extract', 'vinegar',
  ] },
  { category: 'Snacks & Candy', terms: [
    'candy', 'chips', 'chocolate', 'cookie', 'cracker', 'granola bar', 'nuts',
    'popcorn', 'pretzel', 'trail mix',
  ] },
  { category: 'Beverages', terms: [
    'beer', 'coffee', 'juice', 'lemonade', 'orange juice', 'soda', 'sparkling water',
    'tea', 'water', 'wine',
  ] },
  { category: 'Household', terms: [
    'aluminum foil', 'bleach', 'cleaner', 'dish soap', 'dishwasher detergent',
    'laundry detergent', 'paper towel', 'soap', 'sponge', 'toilet paper', 'trash bag',
  ] },
  { category: 'Personal Care', terms: [
    'conditioner', 'deodorant', 'floss', 'lotion', 'shampoo', 'toothbrush', 'toothpaste',
  ] },
  { category: 'Pet Care', terms: [
    'cat food', 'cat litter', 'dog food', 'dog treat', 'pet food',
  ] },
];

function termPattern(term: string): RegExp {
  const words = term.split(' ');
  const last = words.length - 1;
  const pattern = words.map((word, index) => {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (index !== last || word.endsWith('s')) return escaped;
    if (word.endsWith('y')) return `${escaped.slice(0, -1)}(?:y|ies)`;
    if (/(?:ch|sh|x)$/.test(word)) return `${escaped}(?:es)?`;
    if (word.endsWith('o')) return `${escaped}(?:es|s)?`;
    return `${escaped}s?`;
  }).join('\\s+');
  return new RegExp(`(?:^|[^a-z0-9])${pattern}(?=$|[^a-z0-9])`, 'i');
}

const COMPILED_RULES = RULES.flatMap(({ category, terms }) => terms.map((term) => ({
  category,
  pattern: termPattern(term),
  // Number of words first, then length, for deterministic specificity.
  specificity: term.split(' ').length * 100 + term.length,
})));

/** Return a useful grocery section without requiring a network connection. */
export function categorizeGroceryItem(content: string): GroceryCategory {
  const normalized = content.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  // Storage descriptors are more informative than the ingredient itself.
  if (/(?:^|[^a-z0-9])frozen(?=$|[^a-z0-9])/i.test(normalized)) return 'Frozen Foods';
  if (/(?:^|[^a-z0-9])canned(?=$|[^a-z0-9])/i.test(normalized) &&
      !/(?:^|[^a-z0-9])(?:cat|dog|pet)\s+food(?=$|[^a-z0-9])/i.test(normalized)) {
    return 'Pantry';
  }
  let best: { category: GroceryCategory; specificity: number } | undefined;
  for (const rule of COMPILED_RULES) {
    if (rule.pattern.test(normalized) && (!best || rule.specificity > best.specificity)) {
      best = rule;
    }
  }
  return best?.category ?? 'Other';
}
