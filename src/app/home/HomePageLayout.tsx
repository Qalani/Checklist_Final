import type { ReactNode } from 'react';

import ParallaxBackground from '@/components/ParallaxBackground';

export function HomePageLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-zen-50 via-sage-50 to-warm-50 dark:from-[rgb(var(--color-zen-50)_/_0.92)] dark:via-[rgb(var(--color-zen-100)_/_0.82)] dark:to-[rgb(var(--color-sage-100)_/_0.85)]">
      <ParallaxBackground />
      <div className="relative z-10 min-h-screen">{children}</div>
    </div>
  );
}
