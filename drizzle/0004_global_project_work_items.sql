CREATE TABLE global_project_milestones (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES global_projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  due_at TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_global_project_milestones_project
  ON global_project_milestones(project_id,position,created_at);

CREATE TABLE global_project_tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES global_projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  due_at TEXT,
  assignee_user_id TEXT REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','in_progress','done')),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_global_project_tasks_project
  ON global_project_tasks(project_id,created_at);
