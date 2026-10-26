CREATE TABLE `garden_defect_events` (
	`id` text PRIMARY KEY NOT NULL,
	`defect_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`actor_name` text NOT NULL,
	`at` integer NOT NULL,
	`hash` text NOT NULL,
	`record` text NOT NULL,
	FOREIGN KEY (`defect_id`) REFERENCES `garden_defects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `garden_defect_events_defect_idx` ON `garden_defect_events` (`defect_id`,`at`);--> statement-breakpoint
CREATE TABLE `garden_defect_jobs` (
	`defect_id` text NOT NULL,
	`job_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`created_by` text NOT NULL,
	FOREIGN KEY (`defect_id`) REFERENCES `garden_defects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `garden_defect_jobs_unique` ON `garden_defect_jobs` (`defect_id`,`job_id`);--> statement-breakpoint
CREATE INDEX `garden_defect_jobs_job_idx` ON `garden_defect_jobs` (`job_id`);--> statement-breakpoint
CREATE TABLE `garden_defects` (
	`id` text PRIMARY KEY NOT NULL,
	`garden_id` text NOT NULL,
	`source_job_id` text,
	`source_key` text,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`location` text NOT NULL,
	`priority` text NOT NULL,
	`status` text NOT NULL,
	`discovered_on` text NOT NULL,
	`created_by` text NOT NULL,
	`assigned_to` text,
	`next_step` text NOT NULL,
	`photos` text DEFAULT '[]' NOT NULL,
	`resolution` text NOT NULL,
	`resolved_at` integer,
	`resolved_by` text,
	`version` integer NOT NULL,
	`last_mutation_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`garden_id`) REFERENCES `gardens`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `garden_defects_source_key_unique` ON `garden_defects` (`source_key`);--> statement-breakpoint
CREATE INDEX `garden_defects_garden_status_idx` ON `garden_defects` (`garden_id`,`status`);