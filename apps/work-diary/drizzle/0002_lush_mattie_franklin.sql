CREATE TABLE `service_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`garden_id` text NOT NULL,
	`date` text NOT NULL,
	`work` text NOT NULL,
	`parts` text NOT NULL,
	`notes` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	`deleted` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`garden_id`) REFERENCES `gardens`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `service_logs_garden_date_idx` ON `service_logs` (`garden_id`,`date`);--> statement-breakpoint
ALTER TABLE `gardens` ADD `pump_type` text;