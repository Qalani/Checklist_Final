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
    description: 'Cool sky neutrals from the Solace palette with tranquil teal and lilac accents.',
    type: 'light',
    preview: ['#f5f8fa', '#7199b6', '#8474ce'],
  },
  {
    id: 'dawn-light',
    label: 'Dawn light',
    description: 'Sun-washed taupes with gentle teal and lavender highlights.',
    type: 'light',
    preview: ['#faf0e5', '#bc8c64', '#6ba6a7'],
  },
  {
    id: 'midnight-dark',
    label: 'Midnight dark',
    description: 'Velvet indigo shadows with electric cyan and aurora violet highlights.',
    type: 'dark',
    preview: ['#101426', '#5467a7', '#75ccd6'],
  },
  {
    id: 'forest-dark',
    label: 'Forest dark',
    description: 'Shadowed evergreen canopy warmed by ember-lit accents.',
    type: 'dark',
    preview: ['#122116', '#69a068', '#c8754a'],
  },
];

export const isThemeId = (value: string): value is ThemeId => {
  return themeOptions.some(theme => theme.id === value);
};
