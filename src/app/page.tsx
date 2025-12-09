import { Suspense } from 'react';

import HomePageClient, { HomePageFallback } from './home/HomePageClient';
import { HomePageLayout } from './home/HomePageLayout';

export default function HomePage() {
  return (
    <HomePageLayout>
      <Suspense fallback={<HomePageFallback />}>
        <HomePageClient />
      </Suspense>
    </HomePageLayout>
  );
}
