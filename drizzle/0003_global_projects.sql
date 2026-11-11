CREATE TABLE global_projects (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','archived')),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_global_projects_status ON global_projects(status,created_at);
CREATE INDEX idx_global_projects_creator ON global_projects(created_by,created_at);

CREATE TABLE global_project_participants (
  project_id TEXT NOT NULL REFERENCES global_projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted')),
  invited_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  accepted_at TEXT,
  PRIMARY KEY (project_id,user_id)
);
CREATE INDEX idx_global_project_participants_user ON global_project_participants(user_id,status);
