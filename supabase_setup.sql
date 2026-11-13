-- Выполните этот SQL-скрипт в Supabase:
-- Откройте проект -> SQL Editor -> New query -> Вставьте весь текст -> Run

create extension if not exists "pgcrypto";

-- 1. Уроки (вкладки)
create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subtitle text default '',
  theory text default '',
  sort_order int default 0,
  created_at timestamptz default now()
);

-- 2. Домашние задания
create table if not exists public.homeworks (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid references public.lessons(id) on delete cascade,
  title text not null,
  description text not null,
  deadline text default '',
  max_score int default 5,
  created_at timestamptz default now()
);

-- 3. Решения учеников
create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  homework_id uuid references public.homeworks(id) on delete cascade,
  student_name text not null,
  student_class text not null,
  answer_text text default '',
  file_url text default '',
  file_name text default '',
  status text default 'pending', -- 'pending' | 'graded'
  grade text default '',
  teacher_comment text default '',
  created_at timestamptz default now()
);

-- 4. Тесты
create table if not exists public.tests (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid references public.lessons(id) on delete set null,
  title text not null,
  description text default '',
  questions jsonb not null default '[]'::jsonb,
  created_at timestamptz default now()
);

-- 5. Результаты тестов
create table if not exists public.test_results (
  id uuid primary key default gen_random_uuid(),
  test_id uuid references public.tests(id) on delete cascade,
  student_name text not null,
  student_class text not null,
  score int not null,
  max_score int not null,
  answers jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- Включаем защиту RLS
alter table public.lessons enable row level security;
alter table public.homeworks enable row level security;
alter table public.submissions enable row level security;
alter table public.tests enable row level security;
alter table public.test_results enable row level security;

-- Политики чтения для всех (ученики и учитель)
create policy "Public read lessons" on public.lessons for select using (true);
create policy "Public read homeworks" on public.homeworks for select using (true);
create policy "Public read submissions" on public.submissions for select using (true);
create policy "Public read tests" on public.tests for select using (true);
create policy "Public read test_results" on public.test_results for select using (true);

-- Ученики могут отправлять решения и результаты тестов
create policy "Students insert submissions" on public.submissions for insert with check (true);
create policy "Students insert test_results" on public.test_results for insert with check (true);

-- Учитель (авторизованный пользователь) может управлять всем
create policy "Teacher manage lessons" on public.lessons for all to authenticated using (true) with check (true);
create policy "Teacher manage homeworks" on public.homeworks for all to authenticated using (true) with check (true);
create policy "Teacher manage submissions" on public.submissions for all to authenticated using (true) with check (true);
create policy "Teacher manage tests" on public.tests for all to authenticated using (true) with check (true);
create policy "Teacher manage test_results" on public.test_results for all to authenticated using (true) with check (true);

-- Хранилище для фото и файлов решений
insert into storage.buckets (id, name, public)
values ('solutions', 'solutions', true)
on conflict (id) do nothing;

create policy "Public upload solutions" on storage.objects
for insert with check (bucket_id = 'solutions');

create policy "Public read solutions" on storage.objects
for select using (bucket_id = 'solutions');

create policy "Teacher delete solutions" on storage.objects
for delete to authenticated using (bucket_id = 'solutions');
