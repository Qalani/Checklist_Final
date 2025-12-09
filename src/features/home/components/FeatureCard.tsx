import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import type { ComponentType } from 'react';

export interface FeatureCardProps {
  key: string;
  title: string;
  description: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  primary: string;
  secondary?: string;
  accentGradient: string;
  accentText: string;
  badgeBg: string;
  badgeText: string;
  footerBg: string;
  footerHoverBg: string;
}

export function FeatureCard({ card }: { card: FeatureCardProps }) {
  const Icon = card.icon;

  return (
    <Link
      href={card.href}
      className="group block h-full rounded-3xl focus:outline-none focus-visible:ring-2 focus-visible:ring-sage-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[rgb(var(--color-surface))]"
      aria-label={`Go to ${card.title}`}
    >
      <motion.article
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex h-full flex-col overflow-hidden rounded-3xl border border-zen-200/60 bg-surface/75 shadow-soft backdrop-blur-xl transition duration-300 group-hover:-translate-y-1 group-hover:shadow-lift dark:border-zen-700/40"
      >
        <div className="flex flex-1 flex-col justify-between gap-6 p-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div
                className={`flex h-12 w-12 items-center justify-center rounded-2xl ${card.accentGradient} ${card.accentText} shadow-medium transition group-hover:scale-[1.02]`}
              >
                <Icon className="h-6 w-6" />
              </div>
              <div>
                <div
                  className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${card.badgeBg} ${card.badgeText}`}
                >
                  {card.title}
                </div>
                <p className="mt-3 text-sm text-zen-600 dark:text-zen-200">{card.description}</p>
              </div>
            </div>
            <ArrowRight className="h-5 w-5 text-zen-300 transition-transform group-hover:translate-x-1 dark:text-zen-400" />
          </div>
          <dl className="grid gap-2 text-sm">
            <div className="text-lg font-semibold text-zen-900">{card.primary}</div>
            {card.secondary ? <div className="text-xs text-zen-500 dark:text-zen-300">{card.secondary}</div> : null}
          </dl>
        </div>
        <div
          className={`border-t border-zen-200/50 px-6 py-4 text-sm text-zen-600 transition-colors dark:border-zen-700/40 dark:text-zen-200 ${card.footerBg} ${card.footerHoverBg}`}
        >
          Tap to explore {card.title}
        </div>
      </motion.article>
    </Link>
  );
}
