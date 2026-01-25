# Amsertdam Project

## Tech Stack

### Frontend
- **Next.js 14** - React framework with App Router
- **TypeScript** - Type-safe development
- **Tailwind CSS** - Utility-first CSS framework
- **shadcn/ui + Radix UI** - Accessible component library
- **TanStack Query** - Data fetching and caching
- **Zustand** - Lightweight state management
- **Recharts** - Composable charting library

### Backend & AI
- **Supabase** - BaaS (Backend as a Service)
- **pgvector** - Vector similarity search for embeddings
- **Vercel Python Functions** - Serverless Python for AI processing

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Environment Variables

Copy `.env.example` to `.env.local` and fill in your credentials:

```bash
cp .env.example .env.local
```

Required variables:
- `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key

### 3. Backend Configuration

#### Supabase Configuration

Create Supabase Project
1. Go to [supabase.com](https://supabase.com)
2. Create a new project
3. Copy your project URL and API keys

Set Environment Variables
Update `.env.local` with your Supabase credentials:
```env
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Create and Run Database Migrations
In your Supabase SQL Editor, run the migration files in order.

#### Python Functions Setup

The Python functions are located in `api/python/` and will work automatically with Vercel's dev server.

To test locally:
```bash
npm run dev
```

Vercel automatically detects and deploys Python functions in the `api/` directory.

Required environment variables in Vercel:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## API Endpoints

## Database Schema

## Project Structure

```
src/
├── app/              # Next.js App Router pages
│   └── api/          # API routes
│       └── embeddings/ # Embedding store/search endpoints
├── components/       # React components
├── hooks/            # Custom React hooks
├── lib/              # Utility functions
│   └── supabase/     # Supabase clients
├── providers/        # Context providers (TanStack Query)
├── store/            # Zustand stores
└── types/            # TypeScript types

api/
└── python/           # Vercel Python functions
    └── generate-embedding.py

supabase/
└── migrations/       # Database migrations
```

## Adding shadcn/ui Components

To add new shadcn/ui components:

```bash
npx shadcn@latest add button
npx shadcn@latest add card
npx shadcn@latest add input
# etc.
```

## State Management

### Zustand

Global state is managed with Zustand. See `src/store/use-store.ts` for an example.

```typescript
import { useStore } from '@/store/use-store'

function Component() {
  const { count, increment } = useStore()
  return <button onClick={increment}>{count}</button>
}
```

### TanStack Query

Server state and data fetching is handled by TanStack Query:

```typescript
import { useQuery } from '@tanstack/react-query'

function Component() {
  const { data, isLoading } = useQuery({
    queryKey: ['key'],
    queryFn: fetchData,
  })
}
```

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs)
- [TanStack Query](https://tanstack.com/query/latest)
- [Zustand](https://github.com/pmndrs/zustand)
- [shadcn/ui](https://ui.shadcn.com/)
- [Recharts](https://recharts.org/)
