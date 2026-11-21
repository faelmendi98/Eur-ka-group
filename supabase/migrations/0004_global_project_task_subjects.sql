ALTER TABLE public.global_project_tasks
  ADD COLUMN IF NOT EXISTS subject text NOT NULL DEFAULT 'Général';
