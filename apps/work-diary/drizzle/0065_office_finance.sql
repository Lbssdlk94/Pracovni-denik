CREATE TABLE IF NOT EXISTS office_finance (
 id TEXT PRIMARY KEY NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('contract','bill','advance','recurring')),
 owner_id TEXT NOT NULL REFERENCES members(user_id),
 beneficiary_id TEXT REFERENCES members(user_id),
 discipline TEXT NOT NULL CHECK(discipline IN ('irrigation','garden')),
 job_id TEXT REFERENCES jobs(id),
 status TEXT NOT NULL,
 data TEXT NOT NULL CHECK(json_valid(data)),
 version INTEGER NOT NULL DEFAULT 1,
 operation_id TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS office_finance_scope ON office_finance(discipline,kind,status);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS office_finance_job_contract ON office_finance(job_id) WHERE kind='contract' AND status<>'void';
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS office_finance_bill_reference ON office_finance(discipline,json_extract(data,'$.direction'),lower(json_extract(data,'$.counterparty')),lower(json_extract(data,'$.reference'))) WHERE kind='bill' AND status<>'void' AND json_extract(data,'$.reference')<>'';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS office_finance_events (
 id TEXT PRIMARY KEY NOT NULL,
 record_id TEXT NOT NULL REFERENCES office_finance(id),
 actor_id TEXT NOT NULL,
 action TEXT NOT NULL,
 before_data TEXT,
 after_data TEXT NOT NULL,
 at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS office_advance_purchases (
 purchase_id TEXT PRIMARY KEY NOT NULL REFERENCES office_records(id),
 advance_id TEXT NOT NULL REFERENCES office_finance(id),
 amount_minor INTEGER NOT NULL CHECK(amount_minor>0),
 created_at INTEGER NOT NULL
);
