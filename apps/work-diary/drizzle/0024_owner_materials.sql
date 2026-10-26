CREATE TABLE `material_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`updated_by` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `material_item_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`item_version` integer NOT NULL,
	`snapshot` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`item_id`) REFERENCES `material_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `material_item_revision_idx` ON `material_item_revisions` (`item_id`,`item_version`);--> statement-breakpoint
CREATE TABLE `material_items` (
	`id` text PRIMARY KEY NOT NULL,
	`category_id` text NOT NULL,
	`name` text NOT NULL,
	`sku` text DEFAULT '' NOT NULL,
	`unit` text DEFAULT 'ks' NOT NULL,
	`price_minor` integer NOT NULL,
	`currency` text DEFAULT 'CZK' NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `material_categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `material_items_category_idx` ON `material_items` (`category_id`,`active`,`name`);--> statement-breakpoint
ALTER TABLE `service_reports` ADD `material_items` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
INSERT INTO material_categories(id,name,sort_order,active,version,created_at,updated_at,updated_by) VALUES ('material-category-pipes','Trubky',0,1,1,0,0,'system'),('material-category-nozzles','Trysky',1,1,1,0,0,'system'),('material-category-sprinklers','Postřikovače',2,1,1,0,0,'system'),('material-category-valves','Ventily',3,1,1,0,0,'system'),('material-category-fittings','Spojky a tvarovky',4,1,1,0,0,'system'),('material-category-other','Ostatní',5,1,1,0,0,'system');
