# Синхронизация Nova между ПК и телефоном

Сейчас Nova хранит данные в `localStorage`, поэтому профили, личные записи и общие записи доступны только в одном браузере на одном устройстве. Профиль выбирается без логина и пароля; это разделение внутри приложения, а не защита данных. Для настоящей синхронизации между ПК и телефонами нужен небольшой облачный backend.

## Как работают профили сейчас

- кнопка с инициалами в шапке открывает список пользователей;
- новый профиль добавляется обычным именем, без пароля;
- личные заметки и задачи видны только выбранному профилю;
- записи с режимом `Общая` видны всем профилям и показывают автора;
- для синхронизации между устройствами каждому профилю всё равно понадобится стабильный `user_id` в backend.

## Рекомендуемый вариант: Supabase

1. Создайте проект на [supabase.com](https://supabase.com) и включите вход по email или magic link.
2. Создайте таблицы `notes` и `tasks` с полями:

```sql
create table notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '',
  body text not null default '',
  tag text not null default 'personal',
  favorite boolean not null default false,
  updated_at timestamptz not null default now()
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  date_key date not null,
  time_value time,
  done boolean not null default false,
  updated_at timestamptz not null default now()
);
```

3. Включите Row Level Security. Пользователь должен видеть и менять только свои строки:

```sql
alter table notes enable row level security;
alter table tasks enable row level security;

create policy "own notes" on notes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own tasks" on tasks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

4. Добавьте `@supabase/supabase-js`, URL проекта и публичный anon key в отдельный `config.js`.
5. После входа замените `loadState()` на загрузку `notes` и `tasks` запросами `supabase.from(...).select(...)`.
6. В `saveNote()` и `saveTask()` используйте `upsert` вместо записи в `localStorage`, а в удалении — `delete().eq('id', id)`.
7. После каждой локальной операции обновляйте UI сразу, а запрос отправляйте в фоне. При старте приложения повторно загружайте данные из Supabase.
8. Для обновлений в реальном времени включите Realtime для двух таблиц и подпишитесь на `postgres_changes`. Тогда изменение на телефоне появится на ПК без перезагрузки.

## Что нужно добавить в интерфейс

- экран входа и выхода;
- состояние «синхронизировано / нет сети / ошибка»;
- очередь несинхронизированных изменений на случай офлайн-режима;
- конфликт-режим: для личного приложения достаточно правила «последнее изменение побеждает» по `updated_at`.

Для публикации подойдёт Vercel или Netlify. После публикации один и тот же URL можно открыть на ПК и добавить на домашний экран телефона как PWA.
