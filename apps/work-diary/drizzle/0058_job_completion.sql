CREATE TABLE `job_completion` (
	`job_id` text PRIMARY KEY NOT NULL,
	`percent` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_by` text NOT NULL,
	`updated_name` text NOT NULL,
	`updated_at` integer NOT NULL,
	`day` text NOT NULL,
	`baseline_percent` integer,
	`baseline_day` text,
	`note` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "job_completion_percent" CHECK("job_completion"."percent" BETWEEN 0 AND 100 AND typeof("job_completion"."percent")='integer')
);
--> statement-breakpoint
CREATE TABLE `job_completion_events` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`actor_name` text NOT NULL,
	`at` integer NOT NULL,
	`day` text NOT NULL,
	`kind` text NOT NULL,
	`base_version` integer NOT NULL,
	`before_value` integer,
	`value` integer NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`request_hash` text NOT NULL,
	`valid` integer NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "job_completion_valid" CHECK("job_completion_events"."valid"=1),
	CONSTRAINT "job_completion_kind" CHECK("job_completion_events"."kind" IN ('estimate','target')),
	CONSTRAINT "job_completion_event_value" CHECK("job_completion_events"."value" BETWEEN 0 AND 100 AND typeof("job_completion_events"."value")='integer')
);
--> statement-breakpoint
CREATE INDEX `job_completion_events_job` ON `job_completion_events` (`job_id`,`at`);--> statement-breakpoint
CREATE TABLE `job_completion_targets` (
	`job_id` text PRIMARY KEY NOT NULL,
	`points` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_by` text NOT NULL,
	`updated_name` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "job_completion_target_points" CHECK("job_completion_targets"."points" BETWEEN 1 AND 100 AND typeof("job_completion_targets"."points")='integer')
);
