CREATE TABLE IF NOT EXISTS public.global_project_milestones (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES public.global_projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  due_at date,
  position integer NOT NULL DEFAULT 0,
  created_by text NOT NULL REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_global_project_milestones_project
  ON public.global_project_milestones(project_id,position,created_at);

CREATE TABLE IF NOT EXISTS public.global_project_tasks (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES public.global_projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  due_at date,
  assignee_user_id text REFERENCES public.users(id),
  status text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','in_progress','done')),
  created_by text NOT NULL REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_global_project_tasks_project
  ON public.global_project_tasks(project_id,created_at);

ALTER TABLE public.global_project_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.global_project_tasks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.global_project_milestones, public.global_project_tasks FROM anon, authenticated;
