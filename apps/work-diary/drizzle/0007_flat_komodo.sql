CREATE TABLE `guest_access` (
	`user_id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`token_hash` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `guest_access_email_unique` ON `guest_access` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `guest_access_token_hash_unique` ON `guest_access` (`token_hash`);--> statement-breakpoint
CREATE TABLE `link_attempts` (
	`key` text PRIMARY KEY NOT NULL,
	`window` integer NOT NULL,
	`attempts` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `link_attempts_window_idx` ON `link_attempts` (`window`);--> statement-breakpoint
ALTER TABLE `invitations` ADD `access_token_hash` text;--> statement-breakpoint
ALTER TABLE `invitations` ADD `guest_user_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `invitations_access_token_hash_unique` ON `invitations` (`access_token_hash`);