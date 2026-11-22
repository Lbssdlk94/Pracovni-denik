CREATE TABLE IF NOT EXISTS `job_terms` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`term_date` text NOT NULL,
	`start_time` text DEFAULT '07:00' NOT NULL,
	`end_time` text DEFAULT '15:00' NOT NULL,
	`assigned_users` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `job_terms_job_idx` ON `job_terms` (`job_id`,`term_date`);
