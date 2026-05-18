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
- **Ollama + Llama 3.1 8B** - Local LLM inference (free, no API keys required)

## AI Features

The app includes AI-powered features for studying:

- **Generate Flashcards** - Extract study cards from uploaded documents
- **Generate Quizzes** - Create multiple-choice quizzes from source materials
- **Study Companion** - Chat-based tutoring with streaming responses
- **Task Prioritization** - AI-powered task ranking based on impact vs. effort
- **Weekly Planning** - Automatic schedule generation respecting deadlines
- **Passing Target** - Calculate minimum scores needed for target grades

All AI features use **Ollama** (local LLM) running on `localhost:11434`. See [OLLAMA_SETUP.md](./OLLAMA_SETUP.md) for setup instructions.

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
- `OLLAMA_API_URL` - Ollama endpoint (default: `http://localhost:11434`)
- `OLLAMA_MODEL` - LLM model name (default: `llama2:70b`)

### 2a. Set Up Ollama (for AI Features)

Before running the app, install and start Ollama:

```bash
# Download from https://ollama.ai and install
# Then pull the model:
ollama pull llama2:70b

# Start the Ollama service (if not already running)
ollama serve
```

See [OLLAMA_SETUP.md](./OLLAMA_SETUP.md) for detailed instructions.

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

### Effort Impact Analyzer (Vercel Python Function)

Endpoint: `POST /api/python/effort_impact` (Vercel function)

Single-task request (JSON):

```json
{
  "task_name": "Final Essay",
  "grade_weight": 25,
  "estimated_hours": 8,
  "deadline_days": 5,
  "current_grade": 70,
  "passing_grade": 75,
  "stress_level": 3,
  "weekly_capacity_hours": 20,
  "task_type": "project"
}
```

Example response:

```json
{
  "task_name": "Final Essay",
  "task_type": "project",
  "priority": "HIGH",
  "action": "Do it fully and on time",
  "color": "green",
  "composite_score": 0.81,
  "confidence": 0.88,
  "efficiency_ratio": 3.12,
  "breakdown": {
    "grade_impact": 0.275,
    "urgency": 0.47,
    "gap_factor": 0.25,
    "effort_penalty": 0.4,
    "stress_penalty": 0.5
  },
  "rationale": "Final Essay carries 25% of your final grade; deadline in 5 day(s)."
}
```

Batch request (JSON):

```json
{
  "tasks": [
    { "task_name": "Quiz 1", "grade_weight": 10, "estimated_hours": 1, "deadline_days": 2, "current_grade": 72 },
    { "task_name": "Project", "grade_weight": 30, "estimated_hours": 15, "deadline_days": 10, "current_grade": 68 }
  ]
}
```

Example batch response (abridged):

```json
{
  "tasks": [ /* array of analyzed tasks sorted by composite_score */ ],
  "summary": { "high": 1, "medium": 1, "low": 0 }
}
```

Use a curl call to test locally (Vercel dev):

```bash
curl -X POST http://localhost:3000/api/python/effort_impact -H "Content-Type: application/json" -d '{"task_name":"T1","grade_weight":20,"estimated_hours":4,"deadline_days":3,"current_grade":68}'
```

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
