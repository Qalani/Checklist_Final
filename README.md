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

Edit `.env.local` with your Supabase credentials:
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

4. Run the development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## 🗄️ Supabase Setup

1. Create a new Supabase project at [supabase.com](https://supabase.com)
2. Get your project URL and anon key from API settings
3. Run these SQL commands in the Supabase SQL editor:

### Tasks Table
```sql
CREATE TABLE tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  completed BOOLEAN DEFAULT FALSE,
  priority TEXT CHECK (priority IN ('low', 'medium', 'high')) DEFAULT 'medium',
  category TEXT NOT NULL,
  category_color TEXT NOT NULL,
  "order" INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  user_id UUID REFERENCES auth.users(id)
);
```

### Categories Table
```sql
CREATE TABLE categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### Insert Default Categories
```sql
INSERT INTO categories (name, color) VALUES
  ('Work', '#5a7a5a'),
  ('Personal', '#7a957a'),
  ('Shopping', '#a89478');
```

## 📦 Deployment

### Vercel (Recommended)

1. Push your code to GitHub
2. Connect your repository to Vercel
3. Add environment variables in Vercel project settings
4. Deploy!

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
