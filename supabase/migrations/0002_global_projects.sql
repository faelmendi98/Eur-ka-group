CREATE TABLE IF NOT EXISTS public.global_projects (
  id text PRIMARY KEY,
  title text NOT NULL,
  summary text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','archived')),
  created_by text NOT NULL REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_global_projects_status ON public.global_projects(status,created_at);
CREATE INDEX IF NOT EXISTS idx_global_projects_creator ON public.global_projects(created_by,created_at);

CREATE TABLE IF NOT EXISTS public.global_project_participants (
  project_id text NOT NULL REFERENCES public.global_projects(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES public.users(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted')),
  invited_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  PRIMARY KEY (project_id,user_id)
);

CREATE INDEX IF NOT EXISTS idx_global_project_participants_user
  ON public.global_project_participants(user_id,status);

ALTER TABLE public.global_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.global_project_participants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.global_projects, public.global_project_participants FROM anon, authenticated;
