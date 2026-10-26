CREATE TABLE `job_geocodes` (
	`job_id` text PRIMARY KEY NOT NULL,
	`address` text NOT NULL,
	`candidates` text NOT NULL,
	`selected_id` text,
	`checked_at` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action
);
