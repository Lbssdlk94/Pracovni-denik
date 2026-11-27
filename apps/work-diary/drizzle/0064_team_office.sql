CREATE TABLE IF NOT EXISTS office_records (
 id TEXT PRIMARY KEY NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('leave','purchase','money')),
 owner_id TEXT NOT NULL REFERENCES members(user_id),
 discipline TEXT CHECK(discipline IN ('irrigation','garden')),
 job_id TEXT REFERENCES jobs(id),
 status TEXT NOT NULL,
 data TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(data)),
 version INTEGER NOT NULL DEFAULT 1,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL,
 updated_by TEXT NOT NULL,
 operation_id TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS office_kind_owner ON office_records(kind,owner_id,status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS office_discipline ON office_records(discipline,kind);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS office_events (
 id TEXT PRIMARY KEY NOT NULL,
 record_id TEXT NOT NULL REFERENCES office_records(id),
 actor_id TEXT NOT NULL,
 action TEXT NOT NULL,
 at INTEGER NOT NULL,
 before_data TEXT,
 after_data TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS office_events_record ON office_events(record_id,at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS office_receipts (
 id TEXT PRIMARY KEY NOT NULL,
 record_id TEXT NOT NULL REFERENCES office_records(id),
 uploaded_by TEXT NOT NULL,
 object_key TEXT NOT NULL UNIQUE,
 name TEXT NOT NULL,
 mime TEXT NOT NULL,
 size INTEGER NOT NULL,
 digest TEXT NOT NULL,
 created_at INTEGER NOT NULL
);
