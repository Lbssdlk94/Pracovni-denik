CREATE TABLE `platform_storage_limits` (`scope` text NOT NULL, `resource_id` text NOT NULL, `limit_bytes` integer, `version` integer DEFAULT 1 NOT NULL, `updated_at` integer NOT NULL, PRIMARY KEY (`scope`,`resource_id`));
--> statement-breakpoint
CREATE TABLE `platform_storage_state` (`id` text PRIMARY KEY NOT NULL, `value` text NOT NULL, `updated_at` integer NOT NULL);
