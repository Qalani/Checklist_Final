export type ThemeId = 'zen-light' | 'dawn-light' | 'midnight-dark' | 'forest-dark';

export interface ThemeOption {
  id: ThemeId;
  label: string;
  description: string;
  type: 'light' | 'dark';
  preview: [string, string, string];
}

export const DEFAULT_THEME_ID: ThemeId = 'zen-light';

export const themeOptions: ThemeOption[] = [
  {
    id: 'zen-light',
    label: 'Zen light',
    description: 'Soft neutrals with calming sage greens.',
    type: 'light',
    preview: ['#f8f9fa', '#5a7a5a', '#d9cdb8'],
  },
  {
    id: 'dawn-light',
    label: 'Dawn light',
    description: 'Radiant peaches paired with crisp morning sky blues.',
    type: 'light',
    preview: ['#fff7ef', '#f08b4d', '#426ecd'],
  },
  {
    id: 'midnight-dark',
    label: 'Midnight dark',
    description: 'Velvety navy shadows with luminous aqua highlights.',
    type: 'dark',
    preview: ['#101523', '#6181c4', '#75ccc3'],
  },
  {
    id: 'forest-dark',
    label: 'Forest dark',
    description: 'Shadowed evergreens warmed by soft amber light.',
    type: 'dark',
    preview: ['#121c17', '#74a786', '#d7b15f'],
  },
];

export const isThemeId = (value: string): value is ThemeId => {
  return themeOptions.some(theme => theme.id === value);
};
