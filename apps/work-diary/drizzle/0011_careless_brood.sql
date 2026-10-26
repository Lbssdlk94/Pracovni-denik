CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`address` text NOT NULL,
	`garden_id` text,
	`assigned_to` text NOT NULL,
	`assigned_name` text NOT NULL,
	`due_date` text NOT NULL,
	`status` text NOT NULL,
	`incomplete_reason` text DEFAULT '' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	`deleted` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`garden_id`) REFERENCES `gardens`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `jobs_assigned_created_idx` ON `jobs` (`assigned_to`,`deleted`,`created_at`);--> statement-breakpoint
CREATE INDEX `jobs_created_idx` ON `jobs` (`deleted`,`created_at`);