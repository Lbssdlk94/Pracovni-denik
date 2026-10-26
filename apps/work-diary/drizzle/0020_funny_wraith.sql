ALTER TABLE `subscription_periods` ADD `planning_mode` text DEFAULT 'automatic' NOT NULL;--> statement-breakpoint
ALTER TABLE `subscription_periods` ADD `plan_confirmed_at` integer;--> statement-breakpoint
ALTER TABLE `subscription_periods` ADD `plan_confirmed_by` text;