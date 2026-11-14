CREATE TABLE global_project_notes (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES global_projects(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 160),
  subject TEXT NOT NULL CHECK (length(trim(subject)) BETWEEN 1 AND 120),
  description TEXT NOT NULL CHECK (length(trim(description)) BETWEEN 1 AND 8000),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_global_project_notes_project_created
  ON global_project_notes(project_id,created_at DESC);
CREATE INDEX idx_global_project_notes_author_created
  ON global_project_notes(created_by,created_at DESC);
