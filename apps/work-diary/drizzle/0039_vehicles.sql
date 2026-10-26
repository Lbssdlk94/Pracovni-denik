CREATE TABLE `vehicle_drivers` (
	`user_id` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT 0 NOT NULL,
	`vehicle_id` text,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_at` integer NOT NULL,
	`updated_by` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `vehicle_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`vehicle_id` text NOT NULL,
	`kind` text NOT NULL,
	`date` text NOT NULL,
	`odometer` integer NOT NULL,
	`cost_minor` integer NOT NULL,
	`liters_milli` integer,
	`full` integer DEFAULT 0 NOT NULL,
	`station` text DEFAULT '' NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`updated_at` integer NOT NULL,
	`updated_by` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `vehicle_entries_vehicle_idx` ON `vehicle_entries` (`vehicle_id`,`date`);--> statement-breakpoint
CREATE TABLE `vehicle_operations` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`hash` text NOT NULL,
	`resource_id` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `vehicle_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_id` text NOT NULL,
	`vehicle_id` text NOT NULL,
	`object_key` text NOT NULL,
	`type` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` integer NOT NULL,
	`created_by` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `vehicle_receipts_entry_idx` ON `vehicle_receipts` (`entry_id`);--> statement-breakpoint
CREATE TABLE `vehicles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`plate` text DEFAULT '' NOT NULL,
	`model` text DEFAULT '' NOT NULL,
	`vin` text DEFAULT '' NOT NULL,
	`odometer` integer DEFAULT 0 NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`inspection_date` text DEFAULT '' NOT NULL,
	`vignette_date` text DEFAULT '' NOT NULL,
	`lead_days` integer DEFAULT 30 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`updated_by` text NOT NULL
);
