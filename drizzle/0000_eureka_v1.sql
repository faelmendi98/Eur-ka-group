PRAGMA foreign_keys = ON;

CREATE TABLE trades (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','archived')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived_at TEXT
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  auth_subject TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','pending','suspended','disabled')),
  email_verified INTEGER NOT NULL DEFAULT 1 CHECK (email_verified IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at TEXT,
  disabled_at TEXT
);

CREATE TABLE profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  phone TEXT,
  company_name TEXT,
  locale TEXT NOT NULL DEFAULT 'fr-CH',
  bio TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE global_roles (
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK (role IN ('admin_eureka')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, role)
);

CREATE TABLE trade_memberships (
  id TEXT PRIMARY KEY,
  trade_id TEXT NOT NULL REFERENCES trades(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL CHECK (role IN ('freelance','mandataire','specialiste_metier','admin_metier')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('pending','active','suspended','rejected','archived')),
  project_class TEXT CHECK (project_class IN ('D','C','B','A','S')),
  credits INTEGER NOT NULL DEFAULT 0 CHECK (credits BETWEEN 0 AND 100),
  reserved_credits INTEGER NOT NULL DEFAULT 0 CHECK (reserved_credits BETWEEN 0 AND 100),
  rating REAL NOT NULL DEFAULT 0 CHECK (rating BETWEEN 0 AND 5),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (trade_id, user_id, role)
);
CREATE INDEX idx_memberships_trade_role ON trade_memberships(trade_id, role, status);
CREATE INDEX idx_memberships_user ON trade_memberships(user_id, status);

CREATE TABLE admin_invitations (
  id TEXT PRIMARY KEY,
  trade_id TEXT REFERENCES trades(id),
  email TEXT COLLATE NOCASE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin_eureka','admin_metier','specialiste_metier')),
  token_hash TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'awaiting_email' CHECK (status IN ('awaiting_email','pending','accepted','expired','revoked')),
  invited_by TEXT REFERENCES users(id),
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE membership_requests (
  id TEXT PRIMARY KEY,
  trade_id TEXT NOT NULL REFERENCES trades(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  requested_role TEXT NOT NULL CHECK (requested_role IN ('freelance','mandataire')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','needs_information','accepted','rejected','withdrawn')),
  message TEXT,
  decision_reason TEXT,
  decided_by TEXT REFERENCES users(id),
  decided_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX uq_open_membership_request ON membership_requests(trade_id,user_id,requested_role) WHERE status IN ('pending','needs_information');
CREATE INDEX idx_membership_requests_trade ON membership_requests(trade_id,status);

CREATE TABLE trade_settings (
  id TEXT PRIMARY KEY,
  trade_id TEXT NOT NULL REFERENCES trades(id),
  setting_key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','validated','archived')),
  created_by TEXT NOT NULL REFERENCES users(id),
  validated_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (trade_id, setting_key)
);

CREATE TABLE class_rules (
  id TEXT PRIMARY KEY,
  trade_id TEXT NOT NULL REFERENCES trades(id),
  class_code TEXT NOT NULL CHECK (class_code IN ('D','C','B','A','S')),
  minimum_credits INTEGER NOT NULL CHECK (minimum_credits BETWEEN 0 AND 100),
  source TEXT NOT NULL DEFAULT 'validated_configuration',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (trade_id,class_code)
);

CREATE TABLE credit_rules (
  id TEXT PRIMARY KEY,
  trade_id TEXT NOT NULL REFERENCES trades(id),
  rule_key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (trade_id,rule_key)
);

CREATE TABLE skills (
  id TEXT PRIMARY KEY,
  trade_id TEXT NOT NULL REFERENCES trades(id),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (trade_id,name)
);

CREATE TABLE user_skills (
  membership_id TEXT NOT NULL REFERENCES trade_memberships(id),
  skill_id TEXT NOT NULL REFERENCES skills(id),
  level INTEGER NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 5),
  PRIMARY KEY (membership_id,skill_id)
);

CREATE TABLE quote_requests (
  id TEXT PRIMARY KEY,
  trade_id TEXT NOT NULL REFERENCES trades(id),
  mandataire_membership_id TEXT NOT NULL REFERENCES trade_memberships(id),
  personal_number TEXT NOT NULL,
  project_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','under_review','quoted','cancelled','archived')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (trade_id,mandataire_membership_id,personal_number)
);
CREATE INDEX idx_quote_requests_trade_status ON quote_requests(trade_id,status);

CREATE TABLE quotes (
  id TEXT PRIMARY KEY,
  trade_id TEXT NOT NULL REFERENCES trades(id),
  quote_request_id TEXT NOT NULL REFERENCES quote_requests(id),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  eureka_number TEXT NOT NULL,
  project_name TEXT NOT NULL,
  project_class TEXT NOT NULL CHECK (project_class IN ('D','C','B','A','S')),
  required_credits INTEGER NOT NULL CHECK (required_credits BETWEEN 0 AND 100),
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'CHF',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','revision_requested','accepted','refused','archived')),
  revision_message TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  sent_at TEXT,
  decided_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (trade_id,eureka_number),
  UNIQUE (quote_request_id,version)
);
CREATE INDEX idx_quotes_trade_status ON quotes(trade_id,status);

CREATE TABLE missions (
  id TEXT PRIMARY KEY,
  trade_id TEXT NOT NULL REFERENCES trades(id),
  quote_id TEXT NOT NULL UNIQUE REFERENCES quotes(id),
  mandataire_membership_id TEXT NOT NULL REFERENCES trade_memberships(id),
  title TEXT NOT NULL,
  required_class TEXT NOT NULL CHECK (required_class IN ('D','C','B','A','S')),
  required_credits INTEGER NOT NULL CHECK (required_credits BETWEEN 0 AND 100),
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published','assigned','cancelled','archived')),
  applications_limit INTEGER NOT NULL DEFAULT 3 CHECK (applications_limit BETWEEN 1 AND 20),
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_missions_trade_status ON missions(trade_id,status);

CREATE TABLE applications (
  id TEXT PRIMARY KEY,
  trade_id TEXT NOT NULL REFERENCES trades(id),
  mission_id TEXT NOT NULL REFERENCES missions(id),
  freelancer_membership_id TEXT NOT NULL REFERENCES trade_memberships(id),
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','selected','rejected','withdrawn')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (mission_id,freelancer_membership_id)
);
CREATE INDEX idx_applications_mission_status ON applications(mission_id,status);
CREATE INDEX idx_applications_trade ON applications(trade_id,status);

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  trade_id TEXT NOT NULL REFERENCES trades(id),
  mission_id TEXT NOT NULL UNIQUE REFERENCES missions(id),
  mandataire_membership_id TEXT NOT NULL REFERENCES trade_memberships(id),
  freelancer_membership_id TEXT NOT NULL REFERENCES trade_memberships(id),
  title TEXT NOT NULL,
  project_class TEXT NOT NULL CHECK (project_class IN ('D','C','B','A','S')),
  reserved_credits INTEGER NOT NULL CHECK (reserved_credits BETWEEN 0 AND 100),
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','validation_requested','correction_requested','closed','archived','suspended')),
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_projects_trade_status ON projects(trade_id,status);
CREATE INDEX idx_projects_freelancer ON projects(freelancer_membership_id,status);
CREATE INDEX idx_projects_mandataire ON projects(mandataire_membership_id,status);

CREATE TABLE assignments (
  id TEXT PRIMARY KEY,
  trade_id TEXT NOT NULL REFERENCES trades(id),
  mission_id TEXT NOT NULL UNIQUE REFERENCES missions(id),
  project_id TEXT NOT NULL UNIQUE REFERENCES projects(id),
  application_id TEXT NOT NULL UNIQUE REFERENCES applications(id),
  freelancer_membership_id TEXT NOT NULL REFERENCES trade_memberships(id),
  assigned_by_membership_id TEXT NOT NULL REFERENCES trade_memberships(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE milestones (
  id TEXT PRIMARY KEY,
  trade_id TEXT NOT NULL REFERENCES trades(id),
  project_id TEXT NOT NULL REFERENCES projects(id),
  title TEXT NOT NULL,
  due_at TEXT,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','in_progress','submitted','validated','late','cancelled')),
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_milestones_project ON milestones(project_id,position);

CREATE TABLE followup_sessions (
  id TEXT PRIMARY KEY,
  trade_id TEXT NOT NULL REFERENCES trades(id),
  project_id TEXT NOT NULL REFERENCES projects(id),
  title TEXT NOT NULL,
  scheduled_at TEXT,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','held','cancelled')),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE share_folders (
  id TEXT PRIMARY KEY,
  trade_id TEXT NOT NULL REFERENCES trades(id),
  audience TEXT NOT NULL CHECK (audience IN ('freelance','mandataire')),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (trade_id,audience,name)
);
CREATE INDEX idx_share_folders_trade ON share_folders(trade_id,audience,status);

CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  trade_id TEXT NOT NULL REFERENCES trades(id),
  project_id TEXT REFERENCES projects(id),
  quote_request_id TEXT REFERENCES quote_requests(id),
  quote_id TEXT REFERENCES quotes(id),
  membership_request_id TEXT REFERENCES membership_requests(id),
  share_folder_id TEXT REFERENCES share_folders(id),
  area TEXT NOT NULL CHECK (area IN ('cahier_des_charges','mission','documents','suivi','partage_freelance','partage_mandataire','adhesion','devis','facturation')),
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  original_name TEXT NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0 AND size_bytes <= 20971520),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived','deleted')),
  visibility TEXT NOT NULL DEFAULT 'project' CHECK (visibility IN ('project','trade_freelance','trade_mandataire','membership_request','quote_parties','admin_only')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived_at TEXT
);
CREATE INDEX idx_documents_trade_area ON documents(trade_id,area,status);
CREATE INDEX idx_documents_project ON documents(project_id,status);

CREATE TABLE validations (
  id TEXT PRIMARY KEY,
  trade_id TEXT NOT NULL REFERENCES trades(id),
  project_id TEXT NOT NULL REFERENCES projects(id),
  requested_by TEXT NOT NULL REFERENCES users(id),
  decided_by TEXT REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','accepted','correction_requested','cancelled')),
  comment TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_at TEXT
);

CREATE TABLE ratings (
  id TEXT PRIMARY KEY,
  trade_id TEXT NOT NULL REFERENCES trades(id),
  project_id TEXT NOT NULL REFERENCES projects(id),
  rater_user_id TEXT NOT NULL REFERENCES users(id),
  rated_user_id TEXT NOT NULL REFERENCES users(id),
  score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
  comment TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (project_id,rater_user_id,rated_user_id)
);

CREATE TABLE credit_movements (
  id TEXT PRIMARY KEY,
  trade_id TEXT NOT NULL REFERENCES trades(id),
  membership_id TEXT NOT NULL REFERENCES trade_memberships(id),
  project_id TEXT REFERENCES projects(id),
  value_before INTEGER NOT NULL CHECK (value_before BETWEEN 0 AND 100),
  delta INTEGER NOT NULL,
  value_after INTEGER NOT NULL CHECK (value_after BETWEEN 0 AND 100),
  reason TEXT NOT NULL,
  actor_user_id TEXT REFERENCES users(id),
  automatic INTEGER NOT NULL DEFAULT 0 CHECK (automatic IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_credit_movements_membership ON credit_movements(membership_id,created_at);

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  trade_id TEXT REFERENCES trades(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  target_path TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_notifications_user ON notifications(user_id,read_at,created_at);

CREATE TABLE project_events (
  id TEXT PRIMARY KEY,
  trade_id TEXT NOT NULL REFERENCES trades(id),
  project_id TEXT NOT NULL REFERENCES projects(id),
  actor_user_id TEXT REFERENCES users(id),
  event_type TEXT NOT NULL,
  summary TEXT NOT NULL,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_project_events_project ON project_events(project_id,created_at);

CREATE TABLE admin_audit_log (
  id TEXT PRIMARY KEY,
  trade_id TEXT REFERENCES trades(id),
  actor_user_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_admin_audit_actor ON admin_audit_log(actor_user_id,created_at);
CREATE INDEX idx_admin_audit_trade ON admin_audit_log(trade_id,created_at);

CREATE TABLE security_log (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  event_type TEXT NOT NULL,
  outcome TEXT NOT NULL,
  request_id TEXT,
  ip_hash TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_security_log_created ON security_log(created_at);

CREATE TABLE invoices (
  id TEXT PRIMARY KEY,
  trade_id TEXT NOT NULL REFERENCES trades(id),
  project_id TEXT NOT NULL UNIQUE REFERENCES projects(id),
  reference TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'CHF',
  status TEXT NOT NULL DEFAULT 'to_invoice' CHECK (status IN ('to_invoice','invoice_sent','payment_pending','paid','overdue','cancelled')),
  issue_date TEXT,
  due_date TEXT,
  confirmed_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (trade_id,reference)
);

CREATE TABLE invoice_events (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL REFERENCES invoices(id),
  actor_user_id TEXT NOT NULL REFERENCES users(id),
  old_status TEXT,
  new_status TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE legal_documents (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL UNIQUE CHECK (kind IN ('legal_notice','privacy','terms_of_use','commercial_terms','project_confidentiality','reporting','support')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft_legal_review' CHECK (status IN ('draft_legal_review','published','archived')),
  updated_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE account_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL CHECK (kind IN ('data_export','account_deactivation','account_deletion')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','refused')),
  admin_note TEXT,
  processed_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER enforce_membership_request_trade BEFORE INSERT ON membership_requests
WHEN (SELECT trade_id FROM trade_memberships WHERE user_id=NEW.user_id AND role=NEW.requested_role AND status='active') IS NOT NULL
BEGIN SELECT RAISE(ABORT,'duplicate_active_membership'); END;

CREATE TRIGGER enforce_quote_request_trade BEFORE INSERT ON quote_requests
WHEN (SELECT trade_id FROM trade_memberships WHERE id=NEW.mandataire_membership_id) != NEW.trade_id
BEGIN SELECT RAISE(ABORT,'trade_mismatch'); END;

CREATE TRIGGER enforce_quote_trade BEFORE INSERT ON quotes
WHEN (SELECT trade_id FROM quote_requests WHERE id=NEW.quote_request_id) != NEW.trade_id
BEGIN SELECT RAISE(ABORT,'trade_mismatch'); END;

CREATE TRIGGER enforce_mission_trade BEFORE INSERT ON missions
WHEN (SELECT trade_id FROM quotes WHERE id=NEW.quote_id) != NEW.trade_id
 OR (SELECT trade_id FROM trade_memberships WHERE id=NEW.mandataire_membership_id) != NEW.trade_id
BEGIN SELECT RAISE(ABORT,'trade_mismatch'); END;

CREATE TRIGGER enforce_application_trade BEFORE INSERT ON applications
WHEN (SELECT trade_id FROM missions WHERE id=NEW.mission_id) != NEW.trade_id
 OR (SELECT trade_id FROM trade_memberships WHERE id=NEW.freelancer_membership_id) != NEW.trade_id
BEGIN SELECT RAISE(ABORT,'trade_mismatch'); END;

CREATE TRIGGER enforce_project_trade BEFORE INSERT ON projects
WHEN (SELECT trade_id FROM missions WHERE id=NEW.mission_id) != NEW.trade_id
 OR (SELECT trade_id FROM trade_memberships WHERE id=NEW.mandataire_membership_id) != NEW.trade_id
 OR (SELECT trade_id FROM trade_memberships WHERE id=NEW.freelancer_membership_id) != NEW.trade_id
BEGIN SELECT RAISE(ABORT,'trade_mismatch'); END;

CREATE TRIGGER enforce_assignment_trade BEFORE INSERT ON assignments
WHEN (SELECT trade_id FROM missions WHERE id=NEW.mission_id) != NEW.trade_id
 OR (SELECT trade_id FROM projects WHERE id=NEW.project_id) != NEW.trade_id
 OR (SELECT trade_id FROM applications WHERE id=NEW.application_id) != NEW.trade_id
BEGIN SELECT RAISE(ABORT,'trade_mismatch'); END;

CREATE TRIGGER enforce_milestone_trade BEFORE INSERT ON milestones
WHEN (SELECT trade_id FROM projects WHERE id=NEW.project_id) != NEW.trade_id
BEGIN SELECT RAISE(ABORT,'trade_mismatch'); END;

CREATE TRIGGER enforce_session_trade BEFORE INSERT ON followup_sessions
WHEN (SELECT trade_id FROM projects WHERE id=NEW.project_id) != NEW.trade_id
BEGIN SELECT RAISE(ABORT,'trade_mismatch'); END;

CREATE TRIGGER enforce_document_trade BEFORE INSERT ON documents
WHEN (NEW.project_id IS NOT NULL AND (SELECT trade_id FROM projects WHERE id=NEW.project_id) != NEW.trade_id)
 OR (NEW.quote_request_id IS NOT NULL AND (SELECT trade_id FROM quote_requests WHERE id=NEW.quote_request_id) != NEW.trade_id)
 OR (NEW.quote_id IS NOT NULL AND (SELECT trade_id FROM quotes WHERE id=NEW.quote_id) != NEW.trade_id)
 OR (NEW.membership_request_id IS NOT NULL AND (SELECT trade_id FROM membership_requests WHERE id=NEW.membership_request_id) != NEW.trade_id)
 OR (NEW.share_folder_id IS NOT NULL AND (SELECT trade_id FROM share_folders WHERE id=NEW.share_folder_id) != NEW.trade_id)
BEGIN SELECT RAISE(ABORT,'trade_mismatch'); END;

CREATE TRIGGER enforce_validation_trade BEFORE INSERT ON validations
WHEN (SELECT trade_id FROM projects WHERE id=NEW.project_id) != NEW.trade_id
BEGIN SELECT RAISE(ABORT,'trade_mismatch'); END;

CREATE TRIGGER enforce_rating_trade BEFORE INSERT ON ratings
WHEN (SELECT trade_id FROM projects WHERE id=NEW.project_id) != NEW.trade_id
BEGIN SELECT RAISE(ABORT,'trade_mismatch'); END;

CREATE TRIGGER enforce_credit_movement_trade BEFORE INSERT ON credit_movements
WHEN (SELECT trade_id FROM trade_memberships WHERE id=NEW.membership_id) != NEW.trade_id
 OR (NEW.project_id IS NOT NULL AND (SELECT trade_id FROM projects WHERE id=NEW.project_id) != NEW.trade_id)
BEGIN SELECT RAISE(ABORT,'trade_mismatch'); END;

CREATE TRIGGER enforce_invoice_trade BEFORE INSERT ON invoices
WHEN (SELECT trade_id FROM projects WHERE id=NEW.project_id) != NEW.trade_id
BEGIN SELECT RAISE(ABORT,'trade_mismatch'); END;

INSERT INTO trades (id,name,status) VALUES ('trade-rd-horlogerie','R&D horlogerie Mouvement','active');
INSERT INTO legal_documents (id,kind,title,content,status) VALUES
 ('legal-mentions','legal_notice','Mentions légales','Projet de mentions légales à faire valider avant ouverture commerciale.','draft_legal_review'),
 ('legal-confidentialite','privacy','Politique de confidentialité','Projet de politique de confidentialité à faire valider avant ouverture commerciale.','draft_legal_review'),
 ('legal-cgu','terms_of_use','Conditions générales d’utilisation','Projet de CGU à faire valider avant ouverture commerciale.','draft_legal_review'),
 ('legal-commerciales','commercial_terms','Conditions commerciales','Projet de conditions commerciales à faire valider avant ouverture commerciale.','draft_legal_review'),
 ('legal-projets','project_confidentiality','Confidentialité des projets','Projet de règles de confidentialité à faire valider avant ouverture commerciale.','draft_legal_review'),
 ('legal-signalement','reporting','Procédure de signalement','Projet de procédure de signalement à faire valider avant ouverture commerciale.','draft_legal_review'),
 ('legal-support','support','Contact support','Le contact support sera activé après validation de son adresse officielle.','draft_legal_review');
INSERT INTO admin_invitations (id,display_name,role,status) VALUES ('invitation-isiane','Isiane Mendi','admin_eureka','awaiting_email');
