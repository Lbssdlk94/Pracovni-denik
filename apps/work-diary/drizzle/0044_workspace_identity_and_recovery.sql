CREATE TABLE `workspace_identity_aliases` (
	`installation_id` text NOT NULL,
	`external_user_id` text NOT NULL,
	`canonical_user_id` text NOT NULL,
	`original_role` text NOT NULL,
	`original_email` text NOT NULL,
	`original_name` text NOT NULL,
	`approved_by` text NOT NULL,
	`approved_at` integer NOT NULL,
	`method` text NOT NULL,
	PRIMARY KEY(`installation_id`, `external_user_id`),
	FOREIGN KEY (`canonical_user_id`) REFERENCES `members`(`user_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "workspace_identity_method" CHECK("workspace_identity_aliases"."method" IN ('original','confirmed','personal-proof','invitation'))
);
--> statement-breakpoint
CREATE INDEX `workspace_identity_canonical_idx` ON `workspace_identity_aliases` (`canonical_user_id`);--> statement-breakpoint
CREATE TABLE `workspace_identity_events` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`at` integer NOT NULL,
	`installation_id` text NOT NULL,
	`external_user_id` text NOT NULL,
	`canonical_user_id` text NOT NULL,
	`kind` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workspace_recovery_bundles` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`state` text NOT NULL,
	`manifest` text NOT NULL,
	`manifest_hash` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "workspace_recovery_state" CHECK("workspace_recovery_bundles"."state" IN ('uploading','sealed'))
);
--> statement-breakpoint
CREATE INDEX `workspace_recovery_user_idx` ON `workspace_recovery_bundles` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `workspace_recovery_parts` (
	`bundle_id` text NOT NULL,
	`part` integer NOT NULL,
	`size` integer NOT NULL,
	`sha256` text NOT NULL,
	`ready` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`bundle_id`, `part`),
	FOREIGN KEY (`bundle_id`) REFERENCES `workspace_recovery_bundles`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "workspace_recovery_part_size" CHECK("workspace_recovery_parts"."part">=0 AND "workspace_recovery_parts"."size">0 AND "workspace_recovery_parts"."size"<=4194336)
);
--> statement-breakpoint
ALTER TABLE `customers` ADD `contact_notes` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `gardens` ADD `shared_description` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `invitations` ADD `disciplines` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `invitations` ADD `origin_organization_id` text;