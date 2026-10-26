CREATE TABLE `gardens` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`address` text NOT NULL,
	`notes` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`plan_key` text,
	`plan_name` text,
	`plan_type` text,
	`plan_size` integer,
	`plan_version` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `shafts` ADD `garden_id` text REFERENCES gardens(id);