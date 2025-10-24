import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { createClient } from '@supabase/supabase-js';
import ParallaxBackground from '@/components/ParallaxBackground';
import MarkdownDisplay from '@/components/MarkdownDisplay';
import Link from 'next/link';
import { List as ListIcon, CalendarDays, Mail, ArrowLeft, ArrowUpRight } from 'lucide-react';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase credentials are not configured for public list sharing.');
}

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

type PublicListRecord = {
  id: string;
  name: string;
  description: string | null;
  created_at: string | null;
  owner_email: string | null;
};

const fetchPublicList = cache(async (token: string): Promise<PublicListRecord | null> => {
  if (!token || token.trim().length === 0) {
    return null;
  }

  const { data, error } = await supabase.rpc('get_public_list', {
    list_token: token,
  });

  if (error) {
    console.error('Unable to fetch shared list', error);
    throw new Error('Unable to load the shared list.');
  }

  const rows = Array.isArray(data) ? data : data ? [data] : [];
  if (rows.length === 0) {
    return null;
  }

  const record = rows[0] as PublicListRecord;

  return {
    id: record.id,
    name: record.name,
    description: record.description,
    created_at: record.created_at,
    owner_email: record.owner_email,
  };
});

function createMetadataDescription(list: PublicListRecord | null): string | undefined {
  if (!list) {
    return 'This shared Zen list is no longer available.';
  }

  if (list.description) {
    const condensed = list.description.replace(/\s+/g, ' ').trim();
    if (condensed) {
      return condensed.length > 160 ? `${condensed.slice(0, 157)}…` : condensed;
    }
  }

  return 'View this polished Zen list without creating an account.';
}

export async function generateMetadata({ params }: { params: { token: string } }): Promise<Metadata> {
  const list = await fetchPublicList(params.token);

  return {
    title: list ? `${list.name} • Shared Zen list` : 'Shared list unavailable • Zen Lists',
    description: createMetadataDescription(list),
  };
}

function formatDate(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export default async function PublicListPage({ params }: { params: { token: string } }) {
  const list = await fetchPublicList(params.token);

  if (!list) {
    notFound();
  }

  const createdOn = formatDate(list.created_at);

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-zen-50 via-sage-50 to-warm-50">
      <ParallaxBackground />
      <div className="relative z-10 min-h-screen flex flex-col">
        <header className="px-4 py-6 sm:px-8">
          <div className="mx-auto flex w-full max-w-4xl items-center justify-between">
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-full border border-zen-200 bg-surface/70 px-3 py-1 text-xs font-medium text-zen-600 transition-colors hover:border-zen-300 hover:text-zen-800"
            >
              <ArrowLeft className="w-3 h-3" />
              Back to Zen Lists
            </Link>
            <span className="rounded-full border border-zen-200 bg-surface/60 px-3 py-1 text-xs font-medium text-zen-500">
              View only
            </span>
          </div>
        </header>

        <main className="flex-1 px-4 pb-16 sm:px-8">
          <div className="mx-auto flex w-full max-w-4xl flex-col gap-8">
            <section className="rounded-3xl border border-zen-200 bg-surface/90 p-8 shadow-soft">
              <div className="flex flex-col gap-6 sm:flex-row sm:gap-8">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sage-500 to-sage-600 text-white shadow-medium">
                  <ListIcon className="w-8 h-8" />
                </div>
                <div className="flex-1 space-y-4">
                  <div className="inline-flex items-center gap-2 rounded-full bg-zen-100 px-3 py-1 text-xs font-medium text-zen-700">
                    Shared Zen list
                  </div>
                  <h1 className="text-3xl font-semibold text-zen-900 sm:text-4xl">{list.name}</h1>
                  {list.description ? (
                    <MarkdownDisplay text={list.description} className="text-base text-zen-600" />
                  ) : (
                    <p className="text-sm text-zen-500">The owner has not added a description yet.</p>
                  )}
                </div>
              </div>
              <div className="mt-8 flex flex-wrap items-center gap-4 border-t border-zen-100 pt-4 text-xs text-zen-500">
                {createdOn && (
                  <span className="inline-flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-zen-400" />
                    Created {createdOn}
                  </span>
                )}
                {list.owner_email && (
                  <span className="inline-flex items-center gap-2">
                    <Mail className="w-4 h-4 text-zen-400" />
                    {list.owner_email}
                  </span>
                )}
              </div>
            </section>

            <section className="rounded-3xl border border-zen-200 bg-surface/80 p-6 shadow-soft">
              <h2 className="text-lg font-semibold text-zen-900">Create your own serene lists</h2>
              <p className="mt-2 text-sm text-zen-600">
                Sign in to craft collaborative rituals, automate reminders, and keep every detail harmonised across your team.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link
                  href="/"
                  className="inline-flex items-center gap-2 rounded-xl bg-zen-600 px-4 py-2 text-sm font-medium text-white shadow-soft transition-colors hover:bg-zen-700"
                >
                  Explore Zen
                  <ArrowUpRight className="w-4 h-4" />
                </Link>
                <a
                  href="mailto:?subject=Shared%20Zen%20list&body=Thought%20you%E2%80%99d%20appreciate%20this%20shared%20Zen%20list.%20Open%20the%20link%20to%20experience%20it."
                  className="inline-flex items-center gap-2 rounded-xl border border-zen-200 px-4 py-2 text-sm font-medium text-zen-600 transition-colors hover:border-zen-300 hover:text-zen-800"
                >
                  Share via email
                  <Mail className="w-4 h-4" />
                </a>
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
