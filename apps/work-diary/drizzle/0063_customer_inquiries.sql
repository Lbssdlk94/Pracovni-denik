-- Customer inquiries stay in the existing company database. Public clients never receive these rows.
CREATE TABLE `inquiries` (
	`id` text PRIMARY KEY NOT NULL,
	`public_number` text NOT NULL,
	`category` text NOT NULL,
	`service_type` text NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`company` text DEFAULT '' NOT NULL,
	`phone` text NOT NULL,
	`phone_key` text NOT NULL,
	`email` text NOT NULL,
	`email_key` text NOT NULL,
	`street` text NOT NULL,
	`city` text NOT NULL,
	`zip` text DEFAULT '' NOT NULL,
	`address` text NOT NULL,
	`latitude` real,
	`longitude` real,
	`description` text NOT NULL,
	`preferred_date` text DEFAULT '' NOT NULL,
	`extras` text DEFAULT '{}' NOT NULL,
	`consent_text` text NOT NULL,
	`assignee_id` text,
	`internal_note` text DEFAULT '' NOT NULL,
	`customer_id` text,
	`garden_id` text,
	`job_id` text,
	`client_token` text NOT NULL,
	`upload_token_hash` text NOT NULL,
	`upload_expires_at` integer DEFAULT 0 NOT NULL,
	`photo_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	CONSTRAINT "inquiries_category" CHECK("category" IN ('irrigation','garden','both')),
	CONSTRAINT "inquiries_status" CHECK("status" IN ('new','contacted','visit_set','quote_prep','quote_sent','awaiting','accepted','converted','rejected','archived')),
	CONSTRAINT "inquiries_service" CHECK("service_type" IN ('new_install','service','winterize','spring_start','extension','garden_build','maintenance','planting','lawn','other'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `inquiries_number` ON `inquiries` (`public_number`);
--> statement-breakpoint
CREATE UNIQUE INDEX `inquiries_client_token` ON `inquiries` (`client_token`);
--> statement-breakpoint
CREATE INDEX `inquiries_status_created` ON `inquiries` (`status`,`created_at`);
--> statement-breakpoint
CREATE INDEX `inquiries_phone` ON `inquiries` (`phone_key`);
--> statement-breakpoint
CREATE INDEX `inquiries_email` ON `inquiries` (`email_key`);
--> statement-breakpoint
CREATE TABLE `inquiry_photos` (
	`id` text PRIMARY KEY NOT NULL,
	`inquiry_id` text NOT NULL,
	`object_key` text NOT NULL,
	`mime_type` text NOT NULL,
	`size` integer NOT NULL,
	`name` text NOT NULL,
	`sha256` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`inquiry_id`) REFERENCES `inquiries`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `inquiry_photos_inquiry` ON `inquiry_photos` (`inquiry_id`);
--> statement-breakpoint
CREATE TABLE `inquiry_events` (
	`id` text PRIMARY KEY NOT NULL,
	`inquiry_id` text NOT NULL,
	`kind` text NOT NULL,
	`actor_id` text,
	`summary` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`inquiry_id`) REFERENCES `inquiries`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `inquiry_events_inquiry` ON `inquiry_events` (`inquiry_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `inquiry_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`issued_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer
);
--> statement-breakpoint
CREATE TABLE `inquiry_rates` (
	`bucket` text PRIMARY KEY NOT NULL,
	`window_start` integer NOT NULL,
	`count` integer NOT NULL
);
