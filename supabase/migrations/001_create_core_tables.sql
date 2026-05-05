-- 001_create_core_tables.sql
-- Creates core tables: courses, assessments, items, tasks, flashcard_decks, quizzes

-- courses
create table if not exists courses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  credits integer default 0,
  threshold numeric,
  schedule_entries jsonb default '[]',
  assessments jsonb default '[]',
  created_at timestamptz default now()
);

-- assessments (belongs to course)
create table if not exists assessments (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references courses(id) on delete cascade,
  title text not null,
  description text,
  created_at timestamptz default now()
);

-- items (belongs to assessment)
create table if not exists items (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid references assessments(id) on delete cascade,
  title text not null,
  description text,
  created_at timestamptz default now()
);

-- tasks
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  course text,
  date timestamptz,
  estimated_hours numeric,
  priority text,
  description text,
  effort text,
  created_at timestamptz default now()
);

-- flashcard decks with JSON cards
create table if not exists flashcard_decks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  card_count int default 0,
  cards jsonb default '[]',
  created_at timestamptz default now()
);

-- quizzes with JSON questions
create table if not exists quizzes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  course text,
  source text,
  questions jsonb default '[]',
  created_at timestamptz default now()
);
