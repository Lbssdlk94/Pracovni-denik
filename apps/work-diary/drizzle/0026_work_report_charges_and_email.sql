CREATE TABLE `protocol_emails` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`job_version` integer NOT NULL,
	`report_version` integer NOT NULL,
	`recipient` text NOT NULL,
	`filename` text NOT NULL,
	`object_key` text NOT NULL,
	`sha256` text NOT NULL,
	`size` integer NOT NULL,
	`state` text DEFAULT 'uploading' NOT NULL,
	`created_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`reviewed_at` integer,
	`reviewed_by` text,
	`sent_at` integer,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer DEFAULT 0 NOT NULL,
	`lease_token` text,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`last_error` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `protocol_emails_job_idx` ON `protocol_emails` (`job_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `work_rate_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`hourly_minor` integer NOT NULL,
	`travel_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`created_at` integer NOT NULL,
	`created_by` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `customers` ADD `email` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `service_reports` ADD `work_charges` text DEFAULT 'null' NOT NULL;