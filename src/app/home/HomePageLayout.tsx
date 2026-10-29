import type { ReactNode } from 'react';

export function HomePageLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-zen-50">
      {children}
    </div>
  );
}
