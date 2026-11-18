CREATE TABLE `object_storage_index` (`logical_key` text PRIMARY KEY NOT NULL, `company_id` text NOT NULL, `physical_key` text NOT NULL UNIQUE, `category` text NOT NULL, `job_id` text, `size` integer NOT NULL, `sha256` text NOT NULL, `mime_type` text NOT NULL, `state` text NOT NULL, `version` integer DEFAULT 1 NOT NULL, `updated_at` integer NOT NULL);
--> statement-breakpoint
CREATE INDEX `object_storage_company_state` ON `object_storage_index` (`company_id`,`state`);
--> statement-breakpoint
CREATE TABLE `object_storage_events` (`id` text PRIMARY KEY NOT NULL, `company_id` text NOT NULL, `logical_key` text, `actor_id` text NOT NULL, `operation` text NOT NULL, `code` text NOT NULL, `created_at` integer NOT NULL);
--> statement-breakpoint
CREATE TABLE `object_storage_operations` (`company_id` text NOT NULL, `day` text NOT NULL, `class_a` integer DEFAULT 0 NOT NULL, `class_b` integer DEFAULT 0 NOT NULL, `failures` integer DEFAULT 0 NOT NULL, PRIMARY KEY (`company_id`,`day`));
--> statement-breakpoint
CREATE TABLE `job_files` (`id` text PRIMARY KEY NOT NULL, `job_id` text NOT NULL REFERENCES `jobs`(`id`), `company_id` text NOT NULL, `category` text NOT NULL, `name` text NOT NULL, `mime_type` text NOT NULL, `size` integer NOT NULL, `sha256` text NOT NULL, `object_key` text NOT NULL, `thumbnail_key` text, `state` text NOT NULL, `error_code` text, `created_by` text NOT NULL, `created_at` integer NOT NULL, `updated_at` integer NOT NULL, `version` integer DEFAULT 1 NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX `job_file_deduplication` ON `job_files` (`company_id`,`job_id`,`category`,`sha256`) WHERE `state`<>'deleted';
--> statement-breakpoint
ALTER TABLE `workspace_organization_policies` ADD `storage_limit_bytes` integer;

--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_object_storage_index_insert BEFORE INSERT ON "object_storage_index" WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0) BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;

--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_object_storage_index_insert AFTER INSERT ON "object_storage_index" WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0) BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;

--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_object_storage_index_update BEFORE UPDATE ON "object_storage_index" WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0) BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;

--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_object_storage_index_update AFTER UPDATE ON "object_storage_index" WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0) BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;

--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_object_storage_index_delete BEFORE DELETE ON "object_storage_index" WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0) BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;

--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_object_storage_index_delete AFTER DELETE ON "object_storage_index" WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0) BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;

--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_object_storage_events_insert BEFORE INSERT ON "object_storage_events" WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0) BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;

--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_object_storage_events_insert AFTER INSERT ON "object_storage_events" WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0) BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;

--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_object_storage_events_update BEFORE UPDATE ON "object_storage_events" WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0) BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;

--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_object_storage_events_update AFTER UPDATE ON "object_storage_events" WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0) BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;

--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_object_storage_events_delete BEFORE DELETE ON "object_storage_events" WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0) BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;

--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_object_storage_events_delete AFTER DELETE ON "object_storage_events" WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0) BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;

--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_object_storage_operations_insert BEFORE INSERT ON "object_storage_operations" WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0) BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;

--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_object_storage_operations_insert AFTER INSERT ON "object_storage_operations" WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0) BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;

--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_object_storage_operations_update BEFORE UPDATE ON "object_storage_operations" WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0) BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;

--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_object_storage_operations_update AFTER UPDATE ON "object_storage_operations" WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0) BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;

--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_object_storage_operations_delete BEFORE DELETE ON "object_storage_operations" WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0) BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;

--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_object_storage_operations_delete AFTER DELETE ON "object_storage_operations" WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0) BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;

--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_job_files_insert BEFORE INSERT ON "job_files" WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0) BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;

--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_job_files_insert AFTER INSERT ON "job_files" WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0) BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;

--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_job_files_update BEFORE UPDATE ON "job_files" WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0) BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;

--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_job_files_update AFTER UPDATE ON "job_files" WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0) BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;

--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_job_files_delete BEFORE DELETE ON "job_files" WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0) BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;

--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_job_files_delete AFTER DELETE ON "job_files" WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0) BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
