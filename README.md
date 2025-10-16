# Zen Tasks - Modern Task Management App

A beautiful, minimalist task management application built with Next.js 15, React 19, TypeScript, and Supabase. Features a clean "Zen Workspace" design with Bento grid layout, drag-and-drop task reordering, categories, priority levels, and real-time sync.

## ✨ Features

- **Zen Workspace Design**: Clean, minimalist interface with sage green accents and soft shadows
- **Bento Grid Layout**: Modern card-based organization with flexible layouts
- **Task Management**: Create, edit, delete, and complete tasks with ease
- **Drag & Drop**: Reorder tasks with smooth animations
- **Categories**: Color-coded task categories with custom colors
- **Priority Levels**: Low, medium, and high priority tasks
- **Progress Tracking**: Real-time statistics and category breakdowns
- **Dual View Modes**: Switch between grid and list views
- **Real-time Sync**: Supabase integration for data persistence
- **Responsive Design**: Works beautifully on all devices

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Supabase account

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd zen-tasks-app
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.local.example .env.local
```

Edit `.env.local` with your Supabase credentials and site URL:
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

`NEXT_PUBLIC_SITE_URL` should match the origin you configured in both Supabase **Site URL** settings and Google’s **Authorized JavaScript origins** list (e.g. `https://your-production-domain.com`). Leaving it blank falls back to the current browser origin.

4. Run the development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## 🗄️ Supabase Setup

The application uses Supabase for three core capabilities:

1. **Email authentication** – handled via `supabase.auth` in [`src/components/AuthPanel.tsx`](src/components/AuthPanel.tsx), with sessions surfaced to the app shell in [`src/app/page.tsx`](src/app/page.tsx).
2. **Row-level access control** – every task and category row is tied to the authenticated `user_id`, and RLS policies ensure people can only see their own data.
3. **Realtime updates** – the home page subscribes to Supabase Realtime channels so that task and category changes made from other tabs/devices appear instantly.

Follow the steps below to mirror the production-ready configuration locally:

1. **Create a project** at [supabase.com](https://supabase.com) and copy the Project URL and anon key into `.env.local` (see [Getting Started](#-getting-started)). Make sure **Email** auth is enabled under _Authentication → Providers_.
2. **Create the database tables** by running the SQL below in the Supabase SQL editor. This version enforces that every row belongs to a user.

   ```sql
   create table public.tasks (
     id uuid default gen_random_uuid() primary key,
     title text not null,
     description text,
     completed boolean default false,
     priority text check (priority in ('low', 'medium', 'high')) default 'medium',
     category text not null,
     category_color text not null,
     "order" integer not null,
     due_date timestamptz,
     reminder_minutes_before integer,
     created_at timestamptz default now(),
     updated_at timestamptz default now(),
     user_id uuid not null references auth.users(id),
     constraint tasks_reminder_requires_due_date
       check (reminder_minutes_before is null or due_date is not null),
     constraint tasks_reminder_minutes_non_negative
       check (reminder_minutes_before is null or reminder_minutes_before >= 0)
   );

   create table public.categories (
     id uuid default gen_random_uuid() primary key,
     name text not null,
     color text not null,
     user_id uuid not null references auth.users(id),
     created_at timestamptz default now()
   );
   ```

3. **Enable Row Level Security (RLS)** for both tables and add policies that scope reads and writes to the authenticated user. Supabase provides a shortcut via the dashboard, or you can run the SQL below:

   ```sql
   alter table public.tasks enable row level security;
   alter table public.categories enable row level security;

   create policy "Individuals can manage their own tasks"
     on public.tasks
     using (auth.uid() = user_id)
     with check (auth.uid() = user_id);

   create policy "Individuals can manage their own categories"
     on public.categories
     using (auth.uid() = user_id)
     with check (auth.uid() = user_id);
   ```

4. **Seed optional starter categories** that belong to a specific user by running:

   ```sql
   insert into public.categories (name, color, user_id)
   values
     ('Work', '#5a7a5a', auth.uid()),
     ('Personal', '#7a957a', auth.uid()),
     ('Wellness', '#c8d5b9', auth.uid());
   ```

   Execute this snippet while logged in via the Supabase SQL editor to stamp the rows with your user id, or replace `auth.uid()` with a concrete UUID from your `auth.users` table for automated migrations.

5. **Confirm Realtime is enabled** for both tables from the _Database → Realtime_ section of the dashboard. Open each table and toggle on the `INSERT`, `UPDATE`, and `DELETE` events, then save. Those switches wire the tables into Supabase Realtime without needing access to the legacy Replication screen, and the app depends on them to receive push updates.

With those pieces in place the in-app experience will match production: users create accounts, sign in via the Auth panel, and see their personal tasks and categories synced across devices.

### Google OAuth configuration

1. **Prepare Google Cloud** – In <https://console.cloud.google.com>, configure the OAuth consent screen and add each UI origin (development + production) to **Authorized JavaScript origins** when creating a Web application credential.
2. **Authorize the Supabase callback** – Add `https://<PROJECT_REF>.supabase.co/auth/v1/callback` (and `http://localhost:54321/auth/v1/callback` if you use the Supabase CLI) under **Authorized redirect URIs**.
3. **Enable the provider in Supabase** – Paste the generated Client ID and secret into _Authentication → Providers → Google_ inside the Supabase dashboard.
4. **Confirm URLs match** – Ensure the Supabase **Site URL**, your deployed domain(s), and `NEXT_PUBLIC_SITE_URL` all share the same origin. A mismatch between these values is the most common cause of Google’s `redirect_uri_mismatch` error.

### Updating an existing project

If you created the `public.tasks` table before due dates and reminders were introduced, run the migration script in
[`supabase/migrations/20231015_add_due_date_and_reminder_columns.sql`](supabase/migrations/20231015_add_due_date_and_reminder_columns.sql)
from the Supabase SQL editor (or your preferred Postgres client). The script adds the new columns, enforces the reminder
constraints, and creates an index to speed up queries that filter upcoming tasks.

## 📦 Deployment

### Vercel (Recommended)

1. Push your code to GitHub
2. Connect your repository to Vercel
3. Add environment variables in Vercel project settings
4. Deploy!

### Android Packaging

Need a Play Store-ready build? Follow the step-by-step guide in [`docs/android-packaging.md`](docs/android-packaging.md) to wrap the app with Capacitor for an offline bundle or ship it as a Trusted Web Activity that points at your hosted deployment.

### Environment Variables for Production

Set these in your deployment platform:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## 🛠️ Tech Stack

- **Frontend**: Next.js 15, React 19, TypeScript
- **Styling**: Tailwind CSS with custom design system
- **Animations**: Framer Motion
- **Drag & Drop**: @dnd-kit
- **Icons**: Lucide React
- **Database**: Supabase (PostgreSQL)
- **Deployment**: Vercel-ready

## 📁 Project Structure

```
src/
├── app/
│   ├── layout.tsx          # Root layout
│   ├── page.tsx            # Main page
│   └── globals.css         # Global styles
├── components/
│   ├── TaskBentoGrid.tsx   # Grid view component
│   ├── TaskListView.tsx    # List view component
│   ├── TaskForm.tsx        # Task creation/editing modal
│   ├── CategoryManager.tsx # Category management
│   ├── ProgressDashboard.tsx # Progress overview
│   └── QuickStats.tsx      # Statistics cards
├── lib/
│   └── supabase.ts         # Supabase client
└── types/
    └── index.ts            # TypeScript types
```

## 🎨 Design System

### Color Palette
- **Zen**: Neutral grays for backgrounds and text
- **Sage**: Primary green for accents and CTAs
- **Warm**: Warm neutrals for subtle highlights

### Shadows
- **Soft**: Subtle elevation
- **Medium**: Standard elevation
- **Lift**: Interactive hover state

### Layout
- Bento grid system for flexible card layouts
- Consistent 8px spacing scale
- Rounded corners (xl, 2xl, 3xl)

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the MIT License.

## 💬 Support

If you have questions or need help, please open an issue on GitHub.

---

Made with 💚 by Ben Millward-Sadler
