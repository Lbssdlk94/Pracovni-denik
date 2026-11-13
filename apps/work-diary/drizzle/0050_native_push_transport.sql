ALTER TABLE `push_deliveries` ADD `last_error` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `push_subscriptions` ADD `transport` text DEFAULT 'web' NOT NULL;--> statement-breakpoint
ALTER TABLE `push_subscriptions` ADD `native_token` text;--> statement-breakpoint
ALTER TABLE `push_subscriptions` ADD `native_environment` text;--> statement-breakpoint
ALTER TABLE `push_subscriptions` ADD `native_topic` text;