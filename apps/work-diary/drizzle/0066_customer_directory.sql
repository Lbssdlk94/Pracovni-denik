ALTER TABLE customers ADD COLUMN contact_kind TEXT NOT NULL DEFAULT 'customer' CHECK(contact_kind IN ('customer','supplier','both'));
--> statement-breakpoint
ALTER TABLE customers ADD COLUMN contacts TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(contacts));
--> statement-breakpoint
ALTER TABLE customers ADD COLUMN source_ref TEXT;
--> statement-breakpoint
ALTER TABLE customers ADD COLUMN directory_archived INTEGER NOT NULL DEFAULT 0 CHECK(directory_archived IN (0,1));
--> statement-breakpoint
ALTER TABLE customers ADD COLUMN import_details TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(import_details));
--> statement-breakpoint
CREATE UNIQUE INDEX customers_source_ref ON customers(source_ref) WHERE source_ref IS NOT NULL;
--> statement-breakpoint
CREATE TABLE customer_directory_imports(id TEXT PRIMARY KEY,source_digest TEXT NOT NULL,actor_id TEXT NOT NULL,created_at INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'running');
--> statement-breakpoint
CREATE TABLE customer_directory_import_chunks(import_id TEXT NOT NULL REFERENCES customer_directory_imports(id),chunk_index INTEGER NOT NULL,digest TEXT NOT NULL,result TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(import_id,chunk_index));
--> statement-breakpoint
CREATE TABLE customer_directory_import_events(id TEXT PRIMARY KEY,import_id TEXT NOT NULL REFERENCES customer_directory_imports(id),customer_id TEXT NOT NULL,action TEXT NOT NULL,before_data TEXT,after_data TEXT,actor_id TEXT NOT NULL,at INTEGER NOT NULL);
--> statement-breakpoint
CREATE TABLE customer_directory_import_assertions(id TEXT PRIMARY KEY,valid INTEGER NOT NULL CHECK(valid=1));
