CREATE TABLE `service_photos` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`object_key` text NOT NULL,
	`mime_type` text NOT NULL,
	`size` integer NOT NULL,
	`name` text NOT NULL,
	`sha256` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`created_by` text NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `service_photos_job_idx` ON `service_photos` (`job_id`,`status`);