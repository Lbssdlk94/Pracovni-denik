ALTER TABLE `vehicles` ADD `photo_key` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `vehicles` ADD `photo_type` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `vehicles` ADD `photo_size` integer DEFAULT 0 NOT NULL;
