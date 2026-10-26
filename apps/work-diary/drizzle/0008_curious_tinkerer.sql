CREATE TABLE `attendance_corrections` (
	`id` text PRIMARY KEY NOT NULL,
	`shift_id` text NOT NULL,
	`user_id` text NOT NULL,
	`user_name` text NOT NULL,
	`base_version` integer NOT NULL,
	`old_start_at` integer,
	`old_end_at` integer,
	`proposed_start_at` integer NOT NULL,
	`proposed_end_at` integer,
	`reason` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`reviewed_by` text,
	`reviewed_at` integer,
	`review_note` text
);
--> statement-breakpoint
CREATE INDEX `attendance_corrections_user_idx` ON `attendance_corrections` (`user_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `attendance_one_pending_idx` ON `attendance_corrections` (`shift_id`) WHERE "attendance_corrections"."status" = 'pending';--> statement-breakpoint
CREATE TABLE `attendance_shifts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`user_name` text NOT NULL,
	`start_at` integer NOT NULL,
	`end_at` integer,
	`start_position` text,
	`end_position` text,
	`start_gps_status` text NOT NULL,
	`end_gps_status` text,
	`recorded_start_at` integer,
	`recorded_end_at` integer,
	`end_mutation_id` text,
	`last_correction_id` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attendance_shifts_end_mutation_id_unique` ON `attendance_shifts` (`end_mutation_id`);--> statement-breakpoint
CREATE INDEX `attendance_user_start_idx` ON `attendance_shifts` (`user_id`,`start_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `attendance_one_open_idx` ON `attendance_shifts` (`user_id`) WHERE "attendance_shifts"."end_at" IS NULL;