CREATE TABLE `drive_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`email` text NOT NULL,
	`credentials` text,
	`expires_at` integer DEFAULT 0 NOT NULL,
	`root_id` text,
	`root_name` text,
	`state` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_at` integer NOT NULL,
	`updated_by` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `drive_control` (
	`id` text PRIMARY KEY NOT NULL,
	`config` text,
	`active_connection_id` text,
	`version` integer DEFAULT 0 NOT NULL,
	`last_operation` text
);
--> statement-breakpoint
CREATE TABLE `drive_folders` (
	`key` text PRIMARY KEY NOT NULL,
	`connection_id` text NOT NULL,
	`root_id` text NOT NULL,
	`job_id` text,
	`parent_id` text,
	`file_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `drive_folders_file_id_unique` ON `drive_folders` (`file_id`);--> statement-breakpoint
CREATE INDEX `drive_folders_job_idx` ON `drive_folders` (`job_id`);--> statement-breakpoint
CREATE TABLE `drive_oauth_states` (
	`hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`binding_hash` text NOT NULL,
	`verifier` text NOT NULL,
	`mode` text NOT NULL,
	`connection_id` text,
	`control_version` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `job_photos` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`connection_id` text NOT NULL,
	`root_id` text NOT NULL,
	`folder_id` text,
	`file_id` text NOT NULL,
	`category` text NOT NULL,
	`note` text NOT NULL,
	`file_name` text NOT NULL,
	`original_name` text NOT NULL,
	`mime_type` text NOT NULL,
	`size` integer NOT NULL,
	`sha256` text NOT NULL,
	`fingerprint` text NOT NULL,
	`status` text NOT NULL,
	`offset` integer DEFAULT 0 NOT NULL,
	`upload_session` text,
	`thumbnail_key` text,
	`lease_token` text,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`uploaded_at` integer,
	`created_by` text NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `job_photos_file_id_unique` ON `job_photos` (`file_id`);--> statement-breakpoint
CREATE INDEX `job_photos_job_idx` ON `job_photos` (`job_id`,`status`,`created_at`);--> statement-breakpoint
ALTER TABLE `jobs` ADD `customer_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `jobs` ADD `city` text DEFAULT '' NOT NULL;