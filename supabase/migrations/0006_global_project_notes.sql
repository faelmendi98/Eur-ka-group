CREATE TABLE IF NOT EXISTS public.global_project_notes (
  id text PRIMARY KEY,
  project_id text REFERENCES public.global_projects(id) ON DELETE CASCADE,
  created_by text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 160),
  subject text NOT NULL CHECK (char_length(btrim(subject)) BETWEEN 1 AND 120),
  description text NOT NULL CHECK (char_length(btrim(description)) BETWEEN 1 AND 8000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_global_project_notes_project_created
  ON public.global_project_notes(project_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_global_project_notes_author_created
  ON public.global_project_notes(created_by,created_at DESC);

ALTER TABLE public.global_project_notes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.global_project_notes FROM anon, authenticated;
