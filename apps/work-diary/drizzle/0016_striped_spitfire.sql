ALTER TABLE `gardens` ADD `customer_id` text REFERENCES customers(id);--> statement-breakpoint
CREATE INDEX `gardens_customer_idx` ON `gardens` (`customer_id`,`deleted`);