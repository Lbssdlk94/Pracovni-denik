CREATE TABLE `local_auth_events` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text,
	`subject_id` text,
	`kind` text NOT NULL,
	`at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `local_auth_events_at_idx` ON `local_auth_events` (`at`);--> statement-breakpoint
CREATE TABLE `local_auth_rates` (
	`key` text PRIMARY KEY NOT NULL,
	`window` integer NOT NULL,
	`attempts` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `local_credentials` (
	`user_id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`must_change` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `members`(`user_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `local_credentials_username_unique` ON `local_credentials` (`username`);--> statement-breakpoint
ALTER TABLE `access_sessions` ADD `auth_method` text DEFAULT 'link' NOT NULL;--> statement-breakpoint
ALTER TABLE `access_sessions` ADD `password_version` integer;