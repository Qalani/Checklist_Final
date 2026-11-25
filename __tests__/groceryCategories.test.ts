import { categorizeGroceryItem, GROCERY_CATEGORIES } from '@/features/lists/groceryCategories';

describe('categorizeGroceryItem', () => {
  it.each([
    ['2 ripe avocados', 'Produce'],
    ['Blueberries', 'Produce'],
    ['Jalapeños', 'Produce'],
    ['whole wheat bread', 'Bread & Bakery'],
    ['OAT MILK', 'Dairy & Eggs'],
    ['eggs', 'Dairy & Eggs'],
    ['chicken breast', 'Meat & Seafood'],
    ['frozen chicken', 'Frozen Foods'],
    ['frozen blueberries', 'Frozen Foods'],
    ['canned peaches', 'Pantry'],
    ['canned cat food', 'Pet Care'],
    ['chicken broth', 'Pantry'],
    ['tomato soup', 'Pantry'],
    ['orange juice', 'Beverages'],
    ['dish soap', 'Household'],
    ['dog treats', 'Pet Care'],
    ['toothpaste', 'Personal Care'],
    ['chocolate chips', 'Snacks & Candy'],
  ])('places %s in %s', (item, category) => {
    expect(categorizeGroceryItem(item)).toBe(category);
  });

  it('does not match words inside other words and leaves unknown items in Other', () => {
    expect(categorizeGroceryItem('paperclips')).toBe('Other');
    expect(categorizeGroceryItem('coffee filters')).toBe('Beverages');
    expect(categorizeGroceryItem('')).toBe('Other');
    expect(GROCERY_CATEGORIES).toContain('Other');
  });
});
