CREATE TABLE `job_diary_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`date` text NOT NULL,
	`work` text NOT NULL,
	`material` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`next_step` text DEFAULT '' NOT NULL,
	`photo_ids` text DEFAULT '[]' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`last_mutation_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`author_name` text NOT NULL,
	`updated_by` text NOT NULL,
	`updated_by_name` text NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `job_diary_job_date_idx` ON `job_diary_entries` (`job_id`,`date`,`id`);