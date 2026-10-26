CREATE TABLE `garden_geocodes` (
	`garden_id` text PRIMARY KEY NOT NULL,
	`address` text NOT NULL,
	`candidates` text NOT NULL,
	`checked_at` integer NOT NULL,
	FOREIGN KEY (`garden_id`) REFERENCES `gardens`(`id`) ON UPDATE no action ON DELETE no action
);
