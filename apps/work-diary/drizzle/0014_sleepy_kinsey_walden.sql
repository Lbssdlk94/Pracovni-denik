CREATE TABLE `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`phones` text DEFAULT '[]' NOT NULL,
	`addresses` text DEFAULT '[]' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	`deleted` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `customers_name_idx` ON `customers` (`deleted`,`name`);--> statement-breakpoint
ALTER TABLE `jobs` ADD `customer_id` text REFERENCES customers(id);--> statement-breakpoint
ALTER TABLE `jobs` ADD `customer_address_id` text;