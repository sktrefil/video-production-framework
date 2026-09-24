PRAGMA foreign_keys = ON;

ALTER TABLE codex_manager_reviews RENAME TO codex_manager_reviews_v0022;

CREATE TABLE codex_manager_reviews (
  review_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  attempt INTEGER NOT NULL,
  review_kind TEXT NOT NULL CHECK(review_kind IN ('FAILURE','SUCCESS')),
  verdict TEXT NOT NULL CHECK(verdict IN ('APPROVE','RETRY','BLOCK','ESCALATE')),
  root_cause TEXT NOT NULL,
  revision_instruction TEXT NOT NULL,
  preserve_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

INSERT INTO codex_manager_reviews
  (review_id, project_id, task_id, attempt, review_kind, verdict,
   root_cause, revision_instruction, preserve_json, created_at)
SELECT
  review_id, project_id, task_id, attempt, 'FAILURE', verdict,
  root_cause, revision_instruction, preserve_json, created_at
FROM codex_manager_reviews_v0022;

DROP TABLE codex_manager_reviews_v0022;

CREATE INDEX IF NOT EXISTS idx_codex_manager_reviews_project_task
  ON codex_manager_reviews(project_id, task_id, attempt);
