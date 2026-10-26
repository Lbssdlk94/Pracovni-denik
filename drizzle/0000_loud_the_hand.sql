CREATE TABLE `platform_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`resource_id` text NOT NULL,
	`details` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `platform_audit_time_idx` ON `platform_audit` (`created_at`);--> statement-breakpoint
CREATE TABLE `platform_companies` (
	`id` text PRIMARY KEY NOT NULL,
	`profile` text NOT NULL,
	`profession_id` text NOT NULL,
	`profession_version` integer NOT NULL,
	`profession_snapshot` text NOT NULL,
	`plan_id` text NOT NULL,
	`plan_version` integer NOT NULL,
	`plan_snapshot` text NOT NULL,
	`allowed_modules` text NOT NULL,
	`rollout_modules` text NOT NULL,
	`status` text NOT NULL,
	`subscription_status` text DEFAULT 'active' NOT NULL,
	`trial_start` text DEFAULT '' NOT NULL,
	`trial_end` text DEFAULT '' NOT NULL,
	`start_date` text DEFAULT '' NOT NULL,
	`end_date` text DEFAULT '' NOT NULL,
	`installation_id` text,
	`app_url` text,
	`token_hash` text,
	`provision_status` text DEFAULT 'awaiting_host' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`policy_revision` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`profession_id`) REFERENCES `platform_professions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`plan_id`) REFERENCES `platform_plans`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `platform_companies_installation_id_unique` ON `platform_companies` (`installation_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `platform_companies_app_url_unique` ON `platform_companies` (`app_url`);--> statement-breakpoint
CREATE UNIQUE INDEX `platform_companies_token_hash_unique` ON `platform_companies` (`token_hash`);--> statement-breakpoint
CREATE INDEX `platform_companies_status_idx` ON `platform_companies` (`status`,`profession_id`,`plan_id`);--> statement-breakpoint
CREATE TABLE `platform_company_history` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`kind` text NOT NULL,
	`snapshot` text NOT NULL,
	`actor_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `platform_companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `platform_company_history_idx` ON `platform_company_history` (`company_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `platform_invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`consumed_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `platform_companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `platform_invitations_token_hash_unique` ON `platform_invitations` (`token_hash`);--> statement-breakpoint
CREATE TABLE `platform_provisioning_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`company_id` text NOT NULL,
	`operation_key` text NOT NULL,
	`kind` text NOT NULL,
	`state` text NOT NULL,
	`step` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`error` text DEFAULT '' NOT NULL,
	`result` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `platform_companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `platform_provisioning_jobs_operation_key_unique` ON `platform_provisioning_jobs` (`operation_key`);--> statement-breakpoint
CREATE TABLE `platform_company_metrics` (
	`company_id` text PRIMARY KEY NOT NULL,
	`metrics` text NOT NULL,
	`reported_at` integer NOT NULL,
	FOREIGN KEY (`company_id`) REFERENCES `platform_companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `platform_operations` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text NOT NULL,
	`hash` text NOT NULL,
	`response` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `platform_operators` (
	`singleton` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`email` text NOT NULL,
	`secret` text,
	`pending_secret` text,
	`pending_at` integer,
	`last_step` integer DEFAULT -1 NOT NULL,
	`recovery_hashes` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `platform_operators_user_id_unique` ON `platform_operators` (`user_id`);--> statement-breakpoint
CREATE TABLE `platform_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`definition` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `platform_policies` (
	`company_id` text NOT NULL,
	`revision` integer NOT NULL,
	`body` text NOT NULL,
	`signature` text NOT NULL,
	`key_id` text NOT NULL,
	`issued_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	PRIMARY KEY(`company_id`, `revision`),
	FOREIGN KEY (`company_id`) REFERENCES `platform_companies`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `platform_professions` (
	`id` text PRIMARY KEY NOT NULL,
	`definition` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `platform_rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`window` integer NOT NULL,
	`attempts` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `platform_sessions` (
	`hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`last_seen` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `platform_sessions_expiry_idx` ON `platform_sessions` (`expires_at`);