ALTER TABLE global_project_tasks
  ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal'
  CHECK (priority IN ('low','normal','high','urgent'));

CREATE TABLE global_project_task_subjects (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES global_projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL COLLATE NOCASE,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (project_id,name)
);
CREATE INDEX idx_global_project_task_subjects_project
  ON global_project_task_subjects(project_id,name);

CREATE TABLE global_project_task_events (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES global_projects(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL REFERENCES global_project_tasks(id) ON DELETE CASCADE,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  summary TEXT NOT NULL,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_global_project_task_events_task
  ON global_project_task_events(task_id,created_at);

CREATE TABLE global_project_task_documents (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES global_projects(id) ON DELETE CASCADE,
  task_id TEXT NOT NULL REFERENCES global_project_tasks(id) ON DELETE CASCADE,
  uploaded_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  original_name TEXT NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 20971520),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_global_project_task_documents_task
  ON global_project_task_documents(task_id,created_at);
