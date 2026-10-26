ALTER TABLE `customers` ADD `billing` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `service_reports` ADD `billing_details` text DEFAULT 'null' NOT NULL;