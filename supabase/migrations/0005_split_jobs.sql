-- Samesay: Auto-split. A split job keeps its settings and the parts it made
-- ({ preset, mode, len, count, silence, reframe, label, parts: [{ from, to, file }] }).
-- Run once in the Supabase dashboard → SQL Editor.
alter table public.jobs add column if not exists split jsonb;
