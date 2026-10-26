ALTER TABLE `gardens` ADD `deleted` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `gardens` ADD `deletion_token` text;