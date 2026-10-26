DROP INDEX `attendance_one_open_idx`;--> statement-breakpoint
ALTER TABLE `attendance_shifts` ADD `deleted_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `attendance_one_active_open_idx` ON `attendance_shifts` (`user_id`) WHERE "attendance_shifts"."end_at" IS NULL AND "attendance_shifts"."deleted_at" IS NULL;--> statement-breakpoint
ALTER TABLE `attendance_corrections` ADD `kind` text DEFAULT 'edit' NOT NULL;