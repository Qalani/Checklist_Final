import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import type { ComponentType } from 'react';

export interface FeatureCardProps {
  key: string;
  title: string;
  description: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  loading?: boolean;
  primary: string;
  secondary?: string;
  footerText: string;
  tone: 'blue' | 'mint' | 'lavender';
}

const tones = {
  blue: 'bg-zen-100 text-zen-700',
  mint: 'bg-sage-100 text-sage-700',
  lavender: 'bg-warm-100 text-warm-700',
};

export function FeatureCard({ card }: { card: FeatureCardProps }) {
  const Icon = card.icon;

  return (
    <Link
      href={card.href}
      className="workspace-card group flex h-full flex-col rounded-2xl border border-zen-100 bg-surface p-6 transition-colors hover:border-zen-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-600 focus-visible:ring-offset-4 focus-visible:ring-offset-zen-50"
      aria-label={`Go to ${card.title}`}
    >
      <div className="flex items-center gap-3">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tones[card.tone]}`}
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <h3 className="text-base font-semibold tracking-[-0.02em] text-zen-900">{card.title}</h3>
      </div>
      <p className="mt-4 min-h-[2.75rem] text-sm leading-relaxed text-zen-700">{card.description}</p>
      <div className="mb-5 mt-5 min-h-[3rem]" aria-busy={card.loading || undefined}>
        {card.loading ? (
          <div
            role="status"
            aria-label={`Loading ${card.title}`}
            className="space-y-2 motion-safe:animate-pulse"
          >
            <div className="h-5 w-3/4 rounded bg-zen-100" />
            <div className="h-3 w-1/2 rounded bg-zen-100" />
          </div>
        ) : (
          <>
            <p className="text-[17px] font-semibold tracking-[-0.02em] text-zen-900">{card.primary}</p>
            {card.secondary && <p className="mt-1 text-xs leading-relaxed text-zen-700">{card.secondary}</p>}
          </>
        )}
      </div>
      <div className="mt-auto flex min-h-11 items-center justify-between gap-3 border-t border-zen-100 pt-4 text-sm font-medium text-zen-700 group-hover:text-sage-700">
        <span>{card.footerText}</span>
        <ArrowUpRight
          aria-hidden="true"
          className="h-4 w-4 shrink-0 transition-transform motion-safe:group-hover:-translate-y-0.5 motion-safe:group-hover:translate-x-0.5"
        />
      </div>
    </Link>
  );
}
