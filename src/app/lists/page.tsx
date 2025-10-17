'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2, List as ListIcon, Sparkles } from 'lucide-react';
import ThemeSwitcher from '@/components/ThemeSwitcher';
import ParallaxBackground from '@/components/ParallaxBackground';
import { useSupabaseAuth } from '@/lib/hooks/useSupabaseAuth';

export default function ListsPage() {
  const router = useRouter();
  const { user, authChecked } = useSupabaseAuth();

  useEffect(() => {
    if (authChecked && !user) {
      router.replace('/');
    }
  }, [authChecked, router, user]);

  if (!authChecked || !user) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-zen-50 via-warm-50 to-sage-50">
        <ParallaxBackground />
        <div className="relative z-10 flex min-h-screen items-center justify-center">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-sage-200 border-t-sage-600" />
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-zen-50 via-warm-50 to-sage-50">
      <ParallaxBackground />
      <div className="relative z-10 min-h-screen">
        <header className="border-b border-zen-200 bg-surface/70 backdrop-blur-xl">
          <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-sage-500 to-sage-600 shadow-medium">
                <Sparkles className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-zen-900">Zen Tasks</h1>
                <p className="text-sm text-zen-600">Curate calming checklists</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Link
                href="/"
                className="inline-flex items-center gap-2 rounded-full border border-zen-200 bg-surface px-4 py-2 text-sm font-medium text-zen-600 shadow-soft transition hover:-translate-y-0.5 hover:shadow-medium"
              >
                <ArrowLeft className="h-4 w-4" />
                Dashboard
              </Link>
              <ThemeSwitcher />
            </div>
          </div>
        </header>

        <main className="mx-auto flex max-w-7xl flex-col gap-10 px-4 py-8 sm:px-6 lg:px-8">
          <section className="rounded-3xl border border-zen-200 bg-surface/80 p-8 shadow-soft">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-gradient-to-br from-warm-500 to-warm-600 text-white shadow-medium">
                  <ListIcon className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-warm-600">Early preview</p>
                  <h2 className="text-3xl font-semibold text-zen-900">Lists workspace</h2>
                  <p className="mt-2 text-sm text-zen-600">
                    Design evolving collections for recipes, reading queues, trip prep, or anything else that deserves a mindful home.
                  </p>
                </div>
              </div>
              <div className="rounded-2xl bg-zen-100 px-5 py-4 text-sm text-zen-700 shadow-soft">
                We’re polishing the editing experience—thanks for taking an early look.
              </div>
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-6">
              <div className="rounded-3xl border border-zen-200 bg-surface/80 p-6 shadow-soft">
                <h3 className="text-lg font-semibold text-zen-900">What’s coming next</h3>
                <p className="mt-2 text-sm text-zen-600">
                  We’re shaping lists to feel just as serene and powerful as your task workflows.
                </p>
                <ul className="mt-4 space-y-3 text-sm text-zen-600">
                  {["Reusable templates for your favorite rituals", "Lightweight progress tracking and mindful reminders", "Collaborative sharing when you need to plan together"].map(item => (
                    <li key={item} className="flex items-start gap-3">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 text-sage-600" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-3xl border border-dashed border-sage-300 bg-surface/60 p-6 text-sm text-zen-600 shadow-soft">
                <p className="font-medium text-zen-700">Want early input?</p>
                <p className="mt-2">
                  Let us know the kinds of lists you’d love to build and we’ll tailor the experience around them.
                </p>
                <a
                  href="mailto:hello@zentasks.app?subject=Lists%20feedback"
                  className="mt-4 inline-flex w-fit items-center justify-center rounded-full bg-gradient-to-r from-sage-500 to-sage-600 px-4 py-2 text-sm font-semibold text-white shadow-medium transition hover:shadow-large"
                >
                  Share feedback
                </a>
              </div>
            </div>

            <div className="flex flex-col gap-6">
              <div className="relative overflow-hidden rounded-3xl border border-zen-200 bg-surface/90 p-6 shadow-soft">
                <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-warm-200/60 blur-3xl" />
                <div className="relative space-y-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zen-500">Concept sketch</p>
                  <div className="rounded-2xl border border-zen-200 bg-white/80 p-5 shadow-inner">
                    <p className="text-sm font-semibold text-zen-800">Weekend reset</p>
                    <ul className="mt-3 space-y-2 text-sm text-zen-600">
                      {["Plan nourishing meals", "Refresh living space", "Check-in with gratitude"].map(step => (
                        <li key={step} className="flex items-center gap-3 rounded-xl bg-zen-50/80 px-3 py-2">
                          <span className="flex h-8 w-8 items-center justify-center rounded-2xl bg-gradient-to-br from-sage-100 to-sage-200 text-sage-700">
                            •
                          </span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <p className="text-xs text-zen-500">
                    Customize tiles, add mindful reminders, and reorder steps to match your flow.
                  </p>
                </div>
              </div>

              <div className="rounded-3xl border border-zen-200 bg-surface/80 p-6 text-sm text-zen-600 shadow-soft">
                <p className="font-medium text-zen-700">Stay tuned</p>
                <p className="mt-2">
                  Lists will open for creation soon. For now, explore tasks or share your wishlist so we can craft the perfect companion.
                </p>
                <Link
                  href="/tasks"
                  className="mt-4 inline-flex w-fit items-center justify-center rounded-full border border-zen-200 bg-surface px-4 py-2 text-sm font-medium text-zen-600 shadow-soft transition hover:-translate-y-0.5 hover:shadow-medium"
                >
                  Jump to tasks
                </Link>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
