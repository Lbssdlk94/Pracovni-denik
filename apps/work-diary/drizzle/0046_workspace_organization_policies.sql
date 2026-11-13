CREATE TABLE `workspace_organization_config` (
	`organization_id` text PRIMARY KEY NOT NULL,
	`sealed_runtime` text NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `workspace_organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `workspace_organization_policies` (
	`organization_id` text PRIMARY KEY NOT NULL,
	`active` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`revision` integer NOT NULL,
	`features` text NOT NULL,
	`max_users` integer NOT NULL,
	`checked_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `workspace_organizations`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "workspace_org_features_json" CHECK(json_valid("workspace_organization_policies"."features")),
	CONSTRAINT "workspace_org_max_users" CHECK("workspace_organization_policies"."max_users">0)
);

--> statement-breakpoint
CREATE TRIGGER workspace_policy_revision AFTER UPDATE OF active,features ON workspace_organization_policies
WHEN NEW.active<>OLD.active OR NEW.features<>OLD.features
BEGIN UPDATE workspaces SET authorization_revision=authorization_revision+1,updated_at=NEW.checked_at; END;

--> statement-breakpoint
CREATE TRIGGER workspace_jobs_licensed_insert BEFORE INSERT ON jobs
WHEN EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only')) AND NOT EXISTS(
 SELECT 1 FROM workspace_organizations o JOIN workspace_organization_policies p ON p.organization_id=o.id WHERE o.discipline=NEW.discipline AND p.active=1 AND p.expires_at>CAST(strftime('%s','now') AS INTEGER)*1000 AND json_extract(p.features,'$.jobs')=1
) BEGIN SELECT RAISE(ABORT,'workspace_feature_disabled'); END;

--> statement-breakpoint
CREATE TRIGGER workspace_jobs_licensed_update BEFORE UPDATE OF discipline,status,title,description,garden_id,customer_id,assigned_to,assigned_users,due_date,planned_start,estimated_minutes ON jobs
WHEN EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only')) AND NOT EXISTS(
 SELECT 1 FROM workspace_organizations o JOIN workspace_organization_policies p ON p.organization_id=o.id WHERE o.discipline=NEW.discipline AND p.active=1 AND p.expires_at>CAST(strftime('%s','now') AS INTEGER)*1000 AND json_extract(p.features,'$.jobs')=1
) BEGIN SELECT RAISE(ABORT,'workspace_feature_disabled'); END;

--> statement-breakpoint
CREATE TRIGGER workspace_garden_defects_licensed_insert BEFORE INSERT ON garden_defects
WHEN EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only')) AND NOT EXISTS(
 SELECT 1 FROM workspace_organizations o JOIN workspace_organization_policies p ON p.organization_id=o.id WHERE o.discipline=NEW.discipline AND p.active=1 AND p.expires_at>CAST(strftime('%s','now') AS INTEGER)*1000 AND json_extract(p.features,'$.defects')=1
) BEGIN SELECT RAISE(ABORT,'workspace_feature_disabled'); END;

--> statement-breakpoint
CREATE TRIGGER workspace_garden_defects_licensed_update BEFORE UPDATE OF discipline,title,description,photos,status,assigned_to ON garden_defects
WHEN EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only')) AND NOT EXISTS(
 SELECT 1 FROM workspace_organizations o JOIN workspace_organization_policies p ON p.organization_id=o.id WHERE o.discipline=NEW.discipline AND p.active=1 AND p.expires_at>CAST(strftime('%s','now') AS INTEGER)*1000 AND json_extract(p.features,'$.defects')=1
) BEGIN SELECT RAISE(ABORT,'workspace_feature_disabled'); END;

--> statement-breakpoint
CREATE TRIGGER workspace_service_logs_licensed_insert BEFORE INSERT ON service_logs
WHEN EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only')) AND NOT EXISTS(
 SELECT 1 FROM workspace_organizations o JOIN workspace_organization_policies p ON p.organization_id=o.id WHERE o.discipline=NEW.discipline AND p.active=1 AND p.expires_at>CAST(strftime('%s','now') AS INTEGER)*1000 AND json_extract(p.features,'$.service')=1
) BEGIN SELECT RAISE(ABORT,'workspace_feature_disabled'); END;

--> statement-breakpoint
CREATE TRIGGER workspace_service_logs_licensed_update BEFORE UPDATE OF discipline,work,parts,notes,date ON service_logs
WHEN EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only')) AND NOT EXISTS(
 SELECT 1 FROM workspace_organizations o JOIN workspace_organization_policies p ON p.organization_id=o.id WHERE o.discipline=NEW.discipline AND p.active=1 AND p.expires_at>CAST(strftime('%s','now') AS INTEGER)*1000 AND json_extract(p.features,'$.service')=1
) BEGIN SELECT RAISE(ABORT,'workspace_feature_disabled'); END;

--> statement-breakpoint
CREATE TRIGGER workspace_garden_discipline_data_licensed_insert BEFORE INSERT ON garden_discipline_data
WHEN EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only')) AND NOT EXISTS(
 SELECT 1 FROM workspace_organizations o JOIN workspace_organization_policies p ON p.organization_id=o.id WHERE o.discipline=NEW.discipline AND p.active=1 AND p.expires_at>CAST(strftime('%s','now') AS INTEGER)*1000 AND json_extract(p.features,'$.gardens')=1
) BEGIN SELECT RAISE(ABORT,'workspace_feature_disabled'); END;

--> statement-breakpoint
CREATE TRIGGER workspace_garden_discipline_data_licensed_update BEFORE UPDATE OF discipline,notes ON garden_discipline_data
WHEN EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only')) AND NOT EXISTS(
 SELECT 1 FROM workspace_organizations o JOIN workspace_organization_policies p ON p.organization_id=o.id WHERE o.discipline=NEW.discipline AND p.active=1 AND p.expires_at>CAST(strftime('%s','now') AS INTEGER)*1000 AND json_extract(p.features,'$.gardens')=1
) BEGIN SELECT RAISE(ABORT,'workspace_feature_disabled'); END;

--> statement-breakpoint
CREATE TRIGGER workspace_service_reports_licensed_insert BEFORE INSERT ON service_reports
WHEN EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only')) AND NOT EXISTS(
 SELECT 1 FROM workspace_organizations o JOIN workspace_organization_policies p ON p.organization_id=o.id WHERE o.discipline=(SELECT discipline FROM jobs WHERE id=NEW.job_id) AND p.active=1 AND p.expires_at>CAST(strftime('%s','now') AS INTEGER)*1000 AND json_extract(p.features,'$.jobs')=1
) BEGIN SELECT RAISE(ABORT,'workspace_feature_disabled'); END;

--> statement-breakpoint
CREATE TRIGGER workspace_service_reports_licensed_update BEFORE UPDATE OF job_id,work,material,photo_ids ON service_reports
WHEN EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only')) AND NOT EXISTS(
 SELECT 1 FROM workspace_organizations o JOIN workspace_organization_policies p ON p.organization_id=o.id WHERE o.discipline=(SELECT discipline FROM jobs WHERE id=NEW.job_id) AND p.active=1 AND p.expires_at>CAST(strftime('%s','now') AS INTEGER)*1000 AND json_extract(p.features,'$.jobs')=1
) BEGIN SELECT RAISE(ABORT,'workspace_feature_disabled'); END;

--> statement-breakpoint
CREATE TRIGGER workspace_service_photos_licensed_insert BEFORE INSERT ON service_photos
WHEN EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only')) AND NOT EXISTS(
 SELECT 1 FROM workspace_organizations o JOIN workspace_organization_policies p ON p.organization_id=o.id WHERE o.discipline=(SELECT discipline FROM jobs WHERE id=NEW.job_id) AND p.active=1 AND p.expires_at>CAST(strftime('%s','now') AS INTEGER)*1000 AND json_extract(p.features,'$.protocolPhotos')=1 AND json_extract(p.features,'$.photoUploads')=1
) BEGIN SELECT RAISE(ABORT,'workspace_feature_disabled'); END;

--> statement-breakpoint
CREATE TRIGGER workspace_service_photos_licensed_update BEFORE UPDATE OF job_id,status ON service_photos
WHEN EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only')) AND NOT EXISTS(
 SELECT 1 FROM workspace_organizations o JOIN workspace_organization_policies p ON p.organization_id=o.id WHERE o.discipline=(SELECT discipline FROM jobs WHERE id=NEW.job_id) AND p.active=1 AND p.expires_at>CAST(strftime('%s','now') AS INTEGER)*1000 AND json_extract(p.features,'$.protocolPhotos')=1 AND json_extract(p.features,'$.photoUploads')=1
) BEGIN SELECT RAISE(ABORT,'workspace_feature_disabled'); END;
