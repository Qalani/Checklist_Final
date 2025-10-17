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
    description: 'Warm sunrise tones with vibrant coral accents.',
    type: 'light',
    preview: ['#fce9d8', '#f2633a', '#ffd083'],
  },
  {
    id: 'midnight-dark',
    label: 'Midnight dark',
    description: 'Moody indigos with electric teal highlights.',
    type: 'dark',
    preview: ['#1a1f33', '#257499', '#744a8c'],
  },
  {
    id: 'forest-dark',
    label: 'Forest dark',
    description: 'Deep woodland hues with lush emerald accents.',
    type: 'dark',
    preview: ['#1c2921', '#34a579', '#ba9f69'],
  },
];

export const isThemeId = (value: string): value is ThemeId => {
  return themeOptions.some(theme => theme.id === value);
};
