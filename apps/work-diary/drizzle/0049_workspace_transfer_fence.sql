CREATE TABLE `workspace_transfer_assertions` (
	`id` text PRIMARY KEY NOT NULL,
	`valid` integer NOT NULL,
	CONSTRAINT "workspace_transfer_assertion" CHECK("workspace_transfer_assertions"."valid"=1)
);
--> statement-breakpoint
CREATE TABLE `workspace_transfer_control` (
	`singleton` text PRIMARY KEY NOT NULL,
	`generation` integer DEFAULT 0 NOT NULL,
	`freeze_id` text,
	`bypass` integer DEFAULT 0 NOT NULL,
	CONSTRAINT "workspace_transfer_singleton" CHECK("workspace_transfer_control"."singleton"='primary'),
	CONSTRAINT "workspace_transfer_bypass" CHECK("workspace_transfer_control"."bypass" IN (0,1))
);
--> statement-breakpoint
CREATE TABLE `workspace_transfer_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`state` text NOT NULL,
	`created_at` integer NOT NULL,
	`generation` integer NOT NULL,
	`plan_hash` text,
	`summary` text DEFAULT '{}' NOT NULL,
	CONSTRAINT "workspace_transfer_session_state" CHECK("workspace_transfer_sessions"."state" IN ('frozen','released','applied','retired'))
);

--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_attendance_corrections_insert BEFORE INSERT ON "attendance_corrections"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_attendance_corrections_insert AFTER INSERT ON "attendance_corrections"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_attendance_corrections_update BEFORE UPDATE ON "attendance_corrections"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_attendance_corrections_update AFTER UPDATE ON "attendance_corrections"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_attendance_corrections_delete BEFORE DELETE ON "attendance_corrections"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_attendance_corrections_delete AFTER DELETE ON "attendance_corrections"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_attendance_shifts_insert BEFORE INSERT ON "attendance_shifts"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_attendance_shifts_insert AFTER INSERT ON "attendance_shifts"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_attendance_shifts_update BEFORE UPDATE ON "attendance_shifts"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_attendance_shifts_update AFTER UPDATE ON "attendance_shifts"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_attendance_shifts_delete BEFORE DELETE ON "attendance_shifts"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_attendance_shifts_delete AFTER DELETE ON "attendance_shifts"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_customer_disciplines_insert BEFORE INSERT ON "customer_disciplines"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_customer_disciplines_insert AFTER INSERT ON "customer_disciplines"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_customer_disciplines_update BEFORE UPDATE ON "customer_disciplines"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_customer_disciplines_update AFTER UPDATE ON "customer_disciplines"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_customer_disciplines_delete BEFORE DELETE ON "customer_disciplines"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_customer_disciplines_delete AFTER DELETE ON "customer_disciplines"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_customers_insert BEFORE INSERT ON "customers"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_customers_insert AFTER INSERT ON "customers"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_customers_update BEFORE UPDATE ON "customers"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_customers_update AFTER UPDATE ON "customers"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_customers_delete BEFORE DELETE ON "customers"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_customers_delete AFTER DELETE ON "customers"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_drive_connections_insert BEFORE INSERT ON "drive_connections"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_drive_connections_insert AFTER INSERT ON "drive_connections"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_drive_connections_update BEFORE UPDATE ON "drive_connections"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_drive_connections_update AFTER UPDATE ON "drive_connections"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_drive_connections_delete BEFORE DELETE ON "drive_connections"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_drive_connections_delete AFTER DELETE ON "drive_connections"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_drive_control_insert BEFORE INSERT ON "drive_control"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_drive_control_insert AFTER INSERT ON "drive_control"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_drive_control_update BEFORE UPDATE ON "drive_control"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_drive_control_update AFTER UPDATE ON "drive_control"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_drive_control_delete BEFORE DELETE ON "drive_control"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_drive_control_delete AFTER DELETE ON "drive_control"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_drive_folders_insert BEFORE INSERT ON "drive_folders"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_drive_folders_insert AFTER INSERT ON "drive_folders"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_drive_folders_update BEFORE UPDATE ON "drive_folders"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_drive_folders_update AFTER UPDATE ON "drive_folders"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_drive_folders_delete BEFORE DELETE ON "drive_folders"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_drive_folders_delete AFTER DELETE ON "drive_folders"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_drive_oauth_states_insert BEFORE INSERT ON "drive_oauth_states"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_drive_oauth_states_insert AFTER INSERT ON "drive_oauth_states"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_drive_oauth_states_update BEFORE UPDATE ON "drive_oauth_states"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_drive_oauth_states_update AFTER UPDATE ON "drive_oauth_states"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_drive_oauth_states_delete BEFORE DELETE ON "drive_oauth_states"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_drive_oauth_states_delete AFTER DELETE ON "drive_oauth_states"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_garden_defect_events_insert BEFORE INSERT ON "garden_defect_events"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_garden_defect_events_insert AFTER INSERT ON "garden_defect_events"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_garden_defect_events_update BEFORE UPDATE ON "garden_defect_events"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_garden_defect_events_update AFTER UPDATE ON "garden_defect_events"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_garden_defect_events_delete BEFORE DELETE ON "garden_defect_events"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_garden_defect_events_delete AFTER DELETE ON "garden_defect_events"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_garden_defect_jobs_insert BEFORE INSERT ON "garden_defect_jobs"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_garden_defect_jobs_insert AFTER INSERT ON "garden_defect_jobs"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_garden_defect_jobs_update BEFORE UPDATE ON "garden_defect_jobs"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_garden_defect_jobs_update AFTER UPDATE ON "garden_defect_jobs"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_garden_defect_jobs_delete BEFORE DELETE ON "garden_defect_jobs"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_garden_defect_jobs_delete AFTER DELETE ON "garden_defect_jobs"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_garden_defects_insert BEFORE INSERT ON "garden_defects"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_garden_defects_insert AFTER INSERT ON "garden_defects"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_garden_defects_update BEFORE UPDATE ON "garden_defects"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_garden_defects_update AFTER UPDATE ON "garden_defects"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_garden_defects_delete BEFORE DELETE ON "garden_defects"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_garden_defects_delete AFTER DELETE ON "garden_defects"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_garden_discipline_data_insert BEFORE INSERT ON "garden_discipline_data"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_garden_discipline_data_insert AFTER INSERT ON "garden_discipline_data"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_garden_discipline_data_update BEFORE UPDATE ON "garden_discipline_data"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_garden_discipline_data_update AFTER UPDATE ON "garden_discipline_data"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_garden_discipline_data_delete BEFORE DELETE ON "garden_discipline_data"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_garden_discipline_data_delete AFTER DELETE ON "garden_discipline_data"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_garden_disciplines_insert BEFORE INSERT ON "garden_disciplines"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_garden_disciplines_insert AFTER INSERT ON "garden_disciplines"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_garden_disciplines_update BEFORE UPDATE ON "garden_disciplines"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_garden_disciplines_update AFTER UPDATE ON "garden_disciplines"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_garden_disciplines_delete BEFORE DELETE ON "garden_disciplines"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_garden_disciplines_delete AFTER DELETE ON "garden_disciplines"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_garden_geocodes_insert BEFORE INSERT ON "garden_geocodes"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_garden_geocodes_insert AFTER INSERT ON "garden_geocodes"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_garden_geocodes_update BEFORE UPDATE ON "garden_geocodes"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_garden_geocodes_update AFTER UPDATE ON "garden_geocodes"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_garden_geocodes_delete BEFORE DELETE ON "garden_geocodes"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_garden_geocodes_delete AFTER DELETE ON "garden_geocodes"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_gardens_insert BEFORE INSERT ON "gardens"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_gardens_insert AFTER INSERT ON "gardens"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_gardens_update BEFORE UPDATE ON "gardens"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_gardens_update AFTER UPDATE ON "gardens"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_gardens_delete BEFORE DELETE ON "gardens"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_gardens_delete AFTER DELETE ON "gardens"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_guest_access_insert BEFORE INSERT ON "guest_access"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_guest_access_insert AFTER INSERT ON "guest_access"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_guest_access_update BEFORE UPDATE ON "guest_access"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_guest_access_update AFTER UPDATE ON "guest_access"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_guest_access_delete BEFORE DELETE ON "guest_access"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_guest_access_delete AFTER DELETE ON "guest_access"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_installation_state_insert BEFORE INSERT ON "installation_state"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_installation_state_insert AFTER INSERT ON "installation_state"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_installation_state_update BEFORE UPDATE ON "installation_state"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_installation_state_update AFTER UPDATE ON "installation_state"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_installation_state_delete BEFORE DELETE ON "installation_state"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_installation_state_delete AFTER DELETE ON "installation_state"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_invitations_insert BEFORE INSERT ON "invitations"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_invitations_insert AFTER INSERT ON "invitations"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_invitations_update BEFORE UPDATE ON "invitations"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_invitations_update AFTER UPDATE ON "invitations"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_invitations_delete BEFORE DELETE ON "invitations"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_invitations_delete AFTER DELETE ON "invitations"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_job_attempts_insert BEFORE INSERT ON "job_attempts"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_job_attempts_insert AFTER INSERT ON "job_attempts"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_job_attempts_update BEFORE UPDATE ON "job_attempts"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_job_attempts_update AFTER UPDATE ON "job_attempts"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_job_attempts_delete BEFORE DELETE ON "job_attempts"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_job_attempts_delete AFTER DELETE ON "job_attempts"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_job_geocodes_insert BEFORE INSERT ON "job_geocodes"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_job_geocodes_insert AFTER INSERT ON "job_geocodes"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_job_geocodes_update BEFORE UPDATE ON "job_geocodes"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_job_geocodes_update AFTER UPDATE ON "job_geocodes"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_job_geocodes_delete BEFORE DELETE ON "job_geocodes"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_job_geocodes_delete AFTER DELETE ON "job_geocodes"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_job_handoff_events_insert BEFORE INSERT ON "job_handoff_events"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_job_handoff_events_insert AFTER INSERT ON "job_handoff_events"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_job_handoff_events_update BEFORE UPDATE ON "job_handoff_events"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_job_handoff_events_update AFTER UPDATE ON "job_handoff_events"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_job_handoff_events_delete BEFORE DELETE ON "job_handoff_events"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_job_handoff_events_delete AFTER DELETE ON "job_handoff_events"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_job_handoffs_insert BEFORE INSERT ON "job_handoffs"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_job_handoffs_insert AFTER INSERT ON "job_handoffs"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_job_handoffs_update BEFORE UPDATE ON "job_handoffs"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_job_handoffs_update AFTER UPDATE ON "job_handoffs"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_job_handoffs_delete BEFORE DELETE ON "job_handoffs"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_job_handoffs_delete AFTER DELETE ON "job_handoffs"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_job_photos_insert BEFORE INSERT ON "job_photos"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_job_photos_insert AFTER INSERT ON "job_photos"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_job_photos_update BEFORE UPDATE ON "job_photos"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_job_photos_update AFTER UPDATE ON "job_photos"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_job_photos_delete BEFORE DELETE ON "job_photos"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_job_photos_delete AFTER DELETE ON "job_photos"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_jobs_insert BEFORE INSERT ON "jobs"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_jobs_insert AFTER INSERT ON "jobs"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_jobs_update BEFORE UPDATE ON "jobs"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_jobs_update AFTER UPDATE ON "jobs"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_jobs_delete BEFORE DELETE ON "jobs"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_jobs_delete AFTER DELETE ON "jobs"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_material_categories_insert BEFORE INSERT ON "material_categories"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_material_categories_insert AFTER INSERT ON "material_categories"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_material_categories_update BEFORE UPDATE ON "material_categories"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_material_categories_update AFTER UPDATE ON "material_categories"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_material_categories_delete BEFORE DELETE ON "material_categories"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_material_categories_delete AFTER DELETE ON "material_categories"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_material_item_revisions_insert BEFORE INSERT ON "material_item_revisions"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_material_item_revisions_insert AFTER INSERT ON "material_item_revisions"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_material_item_revisions_update BEFORE UPDATE ON "material_item_revisions"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_material_item_revisions_update AFTER UPDATE ON "material_item_revisions"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_material_item_revisions_delete BEFORE DELETE ON "material_item_revisions"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_material_item_revisions_delete AFTER DELETE ON "material_item_revisions"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_material_items_insert BEFORE INSERT ON "material_items"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_material_items_insert AFTER INSERT ON "material_items"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_material_items_update BEFORE UPDATE ON "material_items"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_material_items_update AFTER UPDATE ON "material_items"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_material_items_delete BEFORE DELETE ON "material_items"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_material_items_delete AFTER DELETE ON "material_items"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_member_disciplines_insert BEFORE INSERT ON "member_disciplines"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_member_disciplines_insert AFTER INSERT ON "member_disciplines"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_member_disciplines_update BEFORE UPDATE ON "member_disciplines"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_member_disciplines_update AFTER UPDATE ON "member_disciplines"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_member_disciplines_delete BEFORE DELETE ON "member_disciplines"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_member_disciplines_delete AFTER DELETE ON "member_disciplines"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_members_insert BEFORE INSERT ON "members"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_members_insert AFTER INSERT ON "members"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_members_update BEFORE UPDATE ON "members"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_members_update AFTER UPDATE ON "members"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_members_delete BEFORE DELETE ON "members"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_members_delete AFTER DELETE ON "members"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_notification_preferences_insert BEFORE INSERT ON "notification_preferences"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_notification_preferences_insert AFTER INSERT ON "notification_preferences"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_notification_preferences_update BEFORE UPDATE ON "notification_preferences"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_notification_preferences_update AFTER UPDATE ON "notification_preferences"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_notification_preferences_delete BEFORE DELETE ON "notification_preferences"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_notification_preferences_delete AFTER DELETE ON "notification_preferences"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_notifications_insert BEFORE INSERT ON "notifications"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_notifications_insert AFTER INSERT ON "notifications"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_notifications_update BEFORE UPDATE ON "notifications"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_notifications_update AFTER UPDATE ON "notifications"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_notifications_delete BEFORE DELETE ON "notifications"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_notifications_delete AFTER DELETE ON "notifications"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_protocol_emails_insert BEFORE INSERT ON "protocol_emails"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_protocol_emails_insert AFTER INSERT ON "protocol_emails"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_protocol_emails_update BEFORE UPDATE ON "protocol_emails"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_protocol_emails_update AFTER UPDATE ON "protocol_emails"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_protocol_emails_delete BEFORE DELETE ON "protocol_emails"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_protocol_emails_delete AFTER DELETE ON "protocol_emails"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_push_deliveries_insert BEFORE INSERT ON "push_deliveries"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_push_deliveries_insert AFTER INSERT ON "push_deliveries"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_push_deliveries_update BEFORE UPDATE ON "push_deliveries"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_push_deliveries_update AFTER UPDATE ON "push_deliveries"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_push_deliveries_delete BEFORE DELETE ON "push_deliveries"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_push_deliveries_delete AFTER DELETE ON "push_deliveries"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_push_subscriptions_insert BEFORE INSERT ON "push_subscriptions"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_push_subscriptions_insert AFTER INSERT ON "push_subscriptions"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_push_subscriptions_update BEFORE UPDATE ON "push_subscriptions"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_push_subscriptions_update AFTER UPDATE ON "push_subscriptions"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_push_subscriptions_delete BEFORE DELETE ON "push_subscriptions"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_push_subscriptions_delete AFTER DELETE ON "push_subscriptions"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_service_email_deliveries_insert BEFORE INSERT ON "service_email_deliveries"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_service_email_deliveries_insert AFTER INSERT ON "service_email_deliveries"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_service_email_deliveries_update BEFORE UPDATE ON "service_email_deliveries"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_service_email_deliveries_update AFTER UPDATE ON "service_email_deliveries"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_service_email_deliveries_delete BEFORE DELETE ON "service_email_deliveries"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_service_email_deliveries_delete AFTER DELETE ON "service_email_deliveries"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_service_logs_insert BEFORE INSERT ON "service_logs"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_service_logs_insert AFTER INSERT ON "service_logs"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_service_logs_update BEFORE UPDATE ON "service_logs"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_service_logs_update AFTER UPDATE ON "service_logs"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_service_logs_delete BEFORE DELETE ON "service_logs"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_service_logs_delete AFTER DELETE ON "service_logs"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_service_photos_insert BEFORE INSERT ON "service_photos"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_service_photos_insert AFTER INSERT ON "service_photos"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_service_photos_update BEFORE UPDATE ON "service_photos"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_service_photos_update AFTER UPDATE ON "service_photos"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_service_photos_delete BEFORE DELETE ON "service_photos"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_service_photos_delete AFTER DELETE ON "service_photos"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_service_report_history_insert BEFORE INSERT ON "service_report_history"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_service_report_history_insert AFTER INSERT ON "service_report_history"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_service_report_history_update BEFORE UPDATE ON "service_report_history"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_service_report_history_update AFTER UPDATE ON "service_report_history"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_service_report_history_delete BEFORE DELETE ON "service_report_history"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_service_report_history_delete AFTER DELETE ON "service_report_history"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_service_reports_insert BEFORE INSERT ON "service_reports"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_service_reports_insert AFTER INSERT ON "service_reports"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_service_reports_update BEFORE UPDATE ON "service_reports"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_service_reports_update AFTER UPDATE ON "service_reports"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_service_reports_delete BEFORE DELETE ON "service_reports"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_service_reports_delete AFTER DELETE ON "service_reports"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_service_tariffs_insert BEFORE INSERT ON "service_tariffs"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_service_tariffs_insert AFTER INSERT ON "service_tariffs"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_service_tariffs_update BEFORE UPDATE ON "service_tariffs"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_service_tariffs_update AFTER UPDATE ON "service_tariffs"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_service_tariffs_delete BEFORE DELETE ON "service_tariffs"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_service_tariffs_delete AFTER DELETE ON "service_tariffs"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_settings_insert BEFORE INSERT ON "settings"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_settings_insert AFTER INSERT ON "settings"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_settings_update BEFORE UPDATE ON "settings"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_settings_update AFTER UPDATE ON "settings"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_settings_delete BEFORE DELETE ON "settings"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_settings_delete AFTER DELETE ON "settings"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_shafts_insert BEFORE INSERT ON "shafts"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_shafts_insert AFTER INSERT ON "shafts"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_shafts_update BEFORE UPDATE ON "shafts"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_shafts_update AFTER UPDATE ON "shafts"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_shafts_delete BEFORE DELETE ON "shafts"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_shafts_delete AFTER DELETE ON "shafts"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_subscription_operations_insert BEFORE INSERT ON "subscription_operations"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_subscription_operations_insert AFTER INSERT ON "subscription_operations"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_subscription_operations_update BEFORE UPDATE ON "subscription_operations"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_subscription_operations_update AFTER UPDATE ON "subscription_operations"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_subscription_operations_delete BEFORE DELETE ON "subscription_operations"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_subscription_operations_delete AFTER DELETE ON "subscription_operations"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_subscription_payments_insert BEFORE INSERT ON "subscription_payments"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_subscription_payments_insert AFTER INSERT ON "subscription_payments"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_subscription_payments_update BEFORE UPDATE ON "subscription_payments"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_subscription_payments_update AFTER UPDATE ON "subscription_payments"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_subscription_payments_delete BEFORE DELETE ON "subscription_payments"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_subscription_payments_delete AFTER DELETE ON "subscription_payments"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_subscription_periods_insert BEFORE INSERT ON "subscription_periods"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_subscription_periods_insert AFTER INSERT ON "subscription_periods"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_subscription_periods_update BEFORE UPDATE ON "subscription_periods"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_subscription_periods_update AFTER UPDATE ON "subscription_periods"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_subscription_periods_delete BEFORE DELETE ON "subscription_periods"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_subscription_periods_delete AFTER DELETE ON "subscription_periods"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_subscription_usage_insert BEFORE INSERT ON "subscription_usage"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_subscription_usage_insert AFTER INSERT ON "subscription_usage"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_subscription_usage_update BEFORE UPDATE ON "subscription_usage"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_subscription_usage_update AFTER UPDATE ON "subscription_usage"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_subscription_usage_delete BEFORE DELETE ON "subscription_usage"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_subscription_usage_delete AFTER DELETE ON "subscription_usage"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_subscriptions_insert BEFORE INSERT ON "subscriptions"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_subscriptions_insert AFTER INSERT ON "subscriptions"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_subscriptions_update BEFORE UPDATE ON "subscriptions"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_subscriptions_update AFTER UPDATE ON "subscriptions"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_subscriptions_delete BEFORE DELETE ON "subscriptions"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_subscriptions_delete AFTER DELETE ON "subscriptions"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_vehicle_drivers_insert BEFORE INSERT ON "vehicle_drivers"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_vehicle_drivers_insert AFTER INSERT ON "vehicle_drivers"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_vehicle_drivers_update BEFORE UPDATE ON "vehicle_drivers"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_vehicle_drivers_update AFTER UPDATE ON "vehicle_drivers"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_vehicle_drivers_delete BEFORE DELETE ON "vehicle_drivers"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_vehicle_drivers_delete AFTER DELETE ON "vehicle_drivers"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_vehicle_entries_insert BEFORE INSERT ON "vehicle_entries"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_vehicle_entries_insert AFTER INSERT ON "vehicle_entries"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_vehicle_entries_update BEFORE UPDATE ON "vehicle_entries"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_vehicle_entries_update AFTER UPDATE ON "vehicle_entries"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_vehicle_entries_delete BEFORE DELETE ON "vehicle_entries"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_vehicle_entries_delete AFTER DELETE ON "vehicle_entries"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_vehicle_operations_insert BEFORE INSERT ON "vehicle_operations"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_vehicle_operations_insert AFTER INSERT ON "vehicle_operations"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_vehicle_operations_update BEFORE UPDATE ON "vehicle_operations"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_vehicle_operations_update AFTER UPDATE ON "vehicle_operations"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_vehicle_operations_delete BEFORE DELETE ON "vehicle_operations"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_vehicle_operations_delete AFTER DELETE ON "vehicle_operations"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_vehicle_receipts_insert BEFORE INSERT ON "vehicle_receipts"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_vehicle_receipts_insert AFTER INSERT ON "vehicle_receipts"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_vehicle_receipts_update BEFORE UPDATE ON "vehicle_receipts"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_vehicle_receipts_update AFTER UPDATE ON "vehicle_receipts"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_vehicle_receipts_delete BEFORE DELETE ON "vehicle_receipts"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_vehicle_receipts_delete AFTER DELETE ON "vehicle_receipts"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_vehicles_insert BEFORE INSERT ON "vehicles"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_vehicles_insert AFTER INSERT ON "vehicles"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_vehicles_update BEFORE UPDATE ON "vehicles"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_vehicles_update AFTER UPDATE ON "vehicles"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_vehicles_delete BEFORE DELETE ON "vehicles"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_vehicles_delete AFTER DELETE ON "vehicles"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_work_rate_revisions_insert BEFORE INSERT ON "work_rate_revisions"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_work_rate_revisions_insert AFTER INSERT ON "work_rate_revisions"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_work_rate_revisions_update BEFORE UPDATE ON "work_rate_revisions"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_work_rate_revisions_update AFTER UPDATE ON "work_rate_revisions"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_work_rate_revisions_delete BEFORE DELETE ON "work_rate_revisions"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_work_rate_revisions_delete AFTER DELETE ON "work_rate_revisions"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_workspace_audit_insert BEFORE INSERT ON "workspace_audit"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_workspace_audit_insert AFTER INSERT ON "workspace_audit"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_workspace_audit_update BEFORE UPDATE ON "workspace_audit"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_workspace_audit_update AFTER UPDATE ON "workspace_audit"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_workspace_audit_delete BEFORE DELETE ON "workspace_audit"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_workspace_audit_delete AFTER DELETE ON "workspace_audit"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_workspace_entity_versions_insert BEFORE INSERT ON "workspace_entity_versions"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_workspace_entity_versions_insert AFTER INSERT ON "workspace_entity_versions"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_workspace_entity_versions_update BEFORE UPDATE ON "workspace_entity_versions"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_workspace_entity_versions_update AFTER UPDATE ON "workspace_entity_versions"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_workspace_entity_versions_delete BEFORE DELETE ON "workspace_entity_versions"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_workspace_entity_versions_delete AFTER DELETE ON "workspace_entity_versions"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_workspace_garden_addresses_insert BEFORE INSERT ON "workspace_garden_addresses"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_workspace_garden_addresses_insert AFTER INSERT ON "workspace_garden_addresses"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_workspace_garden_addresses_update BEFORE UPDATE ON "workspace_garden_addresses"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_workspace_garden_addresses_update AFTER UPDATE ON "workspace_garden_addresses"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_workspace_garden_addresses_delete BEFORE DELETE ON "workspace_garden_addresses"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_workspace_garden_addresses_delete AFTER DELETE ON "workspace_garden_addresses"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_workspace_identity_aliases_insert BEFORE INSERT ON "workspace_identity_aliases"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_workspace_identity_aliases_insert AFTER INSERT ON "workspace_identity_aliases"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_workspace_identity_aliases_update BEFORE UPDATE ON "workspace_identity_aliases"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_workspace_identity_aliases_update AFTER UPDATE ON "workspace_identity_aliases"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_workspace_identity_aliases_delete BEFORE DELETE ON "workspace_identity_aliases"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_workspace_identity_aliases_delete AFTER DELETE ON "workspace_identity_aliases"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_workspace_identity_events_insert BEFORE INSERT ON "workspace_identity_events"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_workspace_identity_events_insert AFTER INSERT ON "workspace_identity_events"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_workspace_identity_events_update BEFORE UPDATE ON "workspace_identity_events"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_workspace_identity_events_update AFTER UPDATE ON "workspace_identity_events"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_workspace_identity_events_delete BEFORE DELETE ON "workspace_identity_events"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_workspace_identity_events_delete AFTER DELETE ON "workspace_identity_events"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_workspace_member_grants_insert BEFORE INSERT ON "workspace_member_grants"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_workspace_member_grants_insert AFTER INSERT ON "workspace_member_grants"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_workspace_member_grants_update BEFORE UPDATE ON "workspace_member_grants"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_workspace_member_grants_update AFTER UPDATE ON "workspace_member_grants"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_workspace_member_grants_delete BEFORE DELETE ON "workspace_member_grants"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_workspace_member_grants_delete AFTER DELETE ON "workspace_member_grants"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_workspace_organization_config_insert BEFORE INSERT ON "workspace_organization_config"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_workspace_organization_config_insert AFTER INSERT ON "workspace_organization_config"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_workspace_organization_config_update BEFORE UPDATE ON "workspace_organization_config"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_workspace_organization_config_update AFTER UPDATE ON "workspace_organization_config"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_workspace_organization_config_delete BEFORE DELETE ON "workspace_organization_config"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_workspace_organization_config_delete AFTER DELETE ON "workspace_organization_config"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_workspace_organization_policies_insert BEFORE INSERT ON "workspace_organization_policies"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_workspace_organization_policies_insert AFTER INSERT ON "workspace_organization_policies"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_workspace_organization_policies_update BEFORE UPDATE ON "workspace_organization_policies"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_workspace_organization_policies_update AFTER UPDATE ON "workspace_organization_policies"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_workspace_organization_policies_delete BEFORE DELETE ON "workspace_organization_policies"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_workspace_organization_policies_delete AFTER DELETE ON "workspace_organization_policies"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_workspace_organizations_insert BEFORE INSERT ON "workspace_organizations"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_workspace_organizations_insert AFTER INSERT ON "workspace_organizations"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_workspace_organizations_update BEFORE UPDATE ON "workspace_organizations"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_workspace_organizations_update AFTER UPDATE ON "workspace_organizations"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_workspace_organizations_delete BEFORE DELETE ON "workspace_organizations"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_workspace_organizations_delete AFTER DELETE ON "workspace_organizations"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_workspace_origins_insert BEFORE INSERT ON "workspace_origins"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_workspace_origins_insert AFTER INSERT ON "workspace_origins"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_workspace_origins_update BEFORE UPDATE ON "workspace_origins"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_workspace_origins_update AFTER UPDATE ON "workspace_origins"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_workspace_origins_delete BEFORE DELETE ON "workspace_origins"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_workspace_origins_delete AFTER DELETE ON "workspace_origins"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_workspaces_insert BEFORE INSERT ON "workspaces"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_workspaces_insert AFTER INSERT ON "workspaces"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_workspaces_update BEFORE UPDATE ON "workspaces"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_workspaces_update AFTER UPDATE ON "workspaces"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_freeze_workspaces_delete BEFORE DELETE ON "workspaces"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_transfer_revision_workspaces_delete AFTER DELETE ON "workspaces"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
