CREATE TABLE `access_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`revoked_at` integer,
	`agent` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `access_sessions_token_hash_unique` ON `access_sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `access_sessions_user_idx` ON `access_sessions` (`user_id`,`expires_at`);--> statement-breakpoint
CREATE TABLE `backup_rows` (
	`backup_id` text NOT NULL,
	`table_name` text NOT NULL,
	`ordinal` integer NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `backup_rows_idx` ON `backup_rows` (`backup_id`,`table_name`,`ordinal`);--> statement-breakpoint
CREATE TABLE `installation_state` (
	`singleton` text PRIMARY KEY NOT NULL,
	`instance_id` text NOT NULL,
	`company_name` text DEFAULT 'Závlahový deník' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `installation_state_instance_id_unique` ON `installation_state` (`instance_id`);--> statement-breakpoint
CREATE TABLE `system_backups` (
	`id` text PRIMARY KEY NOT NULL,
	`state` text NOT NULL,
	`created_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`manifest` text DEFAULT '{}' NOT NULL,
	`cursor` text DEFAULT '{}' NOT NULL,
	`lease` text,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`error` text DEFAULT '' NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL
);
--> statement-breakpoint
ALTER TABLE `guest_access` ADD `expires_at` integer;--> statement-breakpoint
ALTER TABLE `guest_access` ADD `single_use` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `invitations` ADD `expires_at` integer;--> statement-breakpoint
INSERT INTO installation_state(singleton,instance_id,company_name,version) VALUES('primary','inst-'||lower(hex(randomblob(16))),'Závlahový deník',1);
--> statement-breakpoint
UPDATE guest_access SET expires_at=CAST(strftime('%s','now') AS INTEGER)*1000+7776000000 WHERE token_hash IS NOT NULL;
--> statement-breakpoint
UPDATE invitations SET expires_at=CAST(strftime('%s','now') AS INTEGER)*1000+604800000 WHERE access_token_hash IS NOT NULL;
