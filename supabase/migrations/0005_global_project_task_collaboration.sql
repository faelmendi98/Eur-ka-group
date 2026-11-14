ALTER TABLE public.global_project_tasks
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal'
  CHECK (priority IN ('low','normal','high','urgent'));

CREATE TABLE IF NOT EXISTS public.global_project_task_subjects (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES public.global_projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_by text REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_global_project_task_subjects_name
  ON public.global_project_task_subjects(project_id,lower(name));
CREATE INDEX IF NOT EXISTS idx_global_project_task_subjects_project
  ON public.global_project_task_subjects(project_id,name);

CREATE TABLE IF NOT EXISTS public.global_project_task_events (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES public.global_projects(id) ON DELETE CASCADE,
  task_id text NOT NULL REFERENCES public.global_project_tasks(id) ON DELETE CASCADE,
  actor_user_id text REFERENCES public.users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  summary text NOT NULL,
  metadata_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_global_project_task_events_task
  ON public.global_project_task_events(task_id,created_at);

CREATE TABLE IF NOT EXISTS public.global_project_task_documents (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES public.global_projects(id) ON DELETE CASCADE,
  task_id text NOT NULL REFERENCES public.global_project_tasks(id) ON DELETE CASCADE,
  uploaded_by text REFERENCES public.users(id) ON DELETE SET NULL,
  original_name text NOT NULL,
  storage_key text NOT NULL UNIQUE,
  mime_type text NOT NULL,
  size_bytes integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 20971520),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_global_project_task_documents_task
  ON public.global_project_task_documents(task_id,created_at);

ALTER TABLE public.global_project_task_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.global_project_task_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.global_project_task_documents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.global_project_task_subjects, public.global_project_task_events, public.global_project_task_documents FROM anon, authenticated;
