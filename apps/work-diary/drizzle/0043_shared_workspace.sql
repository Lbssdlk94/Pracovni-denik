-- Additive staging only; no workspace activated or production rows classified.
CREATE TABLE `customer_disciplines` (
	`customer_id` text NOT NULL,
	`discipline` text NOT NULL,
	PRIMARY KEY(`customer_id`, `discipline`),
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "customer_discipline" CHECK("customer_disciplines"."discipline" IN ('irrigation','garden'))
);
--> statement-breakpoint
CREATE INDEX `customer_disciplines_lookup` ON `customer_disciplines` (`discipline`,`customer_id`);--> statement-breakpoint
CREATE TABLE `garden_discipline_data` (
	`garden_id` text NOT NULL,
	`discipline` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	PRIMARY KEY(`garden_id`, `discipline`),
	FOREIGN KEY (`garden_id`) REFERENCES `gardens`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "garden_work_discipline" CHECK("garden_discipline_data"."discipline" IN ('irrigation','garden'))
);
--> statement-breakpoint
CREATE TABLE `garden_disciplines` (
	`garden_id` text NOT NULL,
	`discipline` text NOT NULL,
	PRIMARY KEY(`garden_id`, `discipline`),
	FOREIGN KEY (`garden_id`) REFERENCES `gardens`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "garden_discipline" CHECK("garden_disciplines"."discipline" IN ('irrigation','garden'))
);
--> statement-breakpoint
CREATE TABLE `member_disciplines` (
	`user_id` text NOT NULL,
	`discipline` text NOT NULL,
	PRIMARY KEY(`user_id`, `discipline`),
	FOREIGN KEY (`user_id`) REFERENCES `members`(`user_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "member_discipline" CHECK("member_disciplines"."discipline" IN ('irrigation','garden'))
);
--> statement-breakpoint
CREATE TABLE `workspace_audit` (
	`operation_id` text PRIMARY KEY NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`at` integer NOT NULL,
	`base_version` integer NOT NULL,
	`old_disciplines` text NOT NULL,
	`new_disciplines` text NOT NULL,
	`request_hash` text NOT NULL,
	CONSTRAINT "workspace_audit_old" CHECK(json_valid("workspace_audit"."old_disciplines")),
	CONSTRAINT "workspace_audit_new" CHECK(json_valid("workspace_audit"."new_disciplines"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_audit_version_key` ON `workspace_audit` (`entity`,`entity_id`,`base_version`);--> statement-breakpoint
CREATE INDEX `workspace_audit_entity` ON `workspace_audit` (`entity`,`entity_id`,`at`);--> statement-breakpoint
CREATE TABLE `workspace_entity_versions` (
	`entity` text NOT NULL,
	`entity_id` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`last_operation` text,
	PRIMARY KEY(`entity`, `entity_id`),
	CONSTRAINT "workspace_entity_kind" CHECK("workspace_entity_versions"."entity" IN ('member','customer','garden'))
);
--> statement-breakpoint
CREATE TABLE `workspace_gateway_nonces` (
	`nonce` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `workspace_gateway_nonces_expiry` ON `workspace_gateway_nonces` (`expires_at`);--> statement-breakpoint
CREATE TABLE `workspace_member_grants` (
	`user_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`original_role` text NOT NULL,
	PRIMARY KEY(`user_id`, `organization_id`),
	FOREIGN KEY (`user_id`) REFERENCES `members`(`user_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `workspace_organizations`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "workspace_original_role" CHECK("workspace_member_grants"."original_role" IN ('owner','administrator','admin','worker','reader'))
);
--> statement-breakpoint
CREATE TABLE `workspace_organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`installation_id` text NOT NULL,
	`discipline` text NOT NULL,
	`name` text NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "workspace_organization_discipline" CHECK("workspace_organizations"."discipline" IN ('irrigation','garden'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_organizations_installation_id_unique` ON `workspace_organizations` (`installation_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_organizations_discipline_unique` ON `workspace_organizations` (`discipline`);--> statement-breakpoint
CREATE TABLE `workspace_origins` (
	`organization_id` text NOT NULL,
	`entity` text NOT NULL,
	`original_id` text NOT NULL,
	`canonical_id` text NOT NULL,
	`source_hash` text NOT NULL,
	PRIMARY KEY(`organization_id`, `entity`, `original_id`),
	FOREIGN KEY (`organization_id`) REFERENCES `workspace_organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`state` text NOT NULL,
	`authorization_revision` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "workspace_state" CHECK("workspaces"."state" IN ('preparing','active','read_only')),
	CONSTRAINT "workspace_revision" CHECK("workspaces"."authorization_revision">0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_single_active` ON `workspaces` ((1));--> statement-breakpoint
ALTER TABLE `garden_defects` ADD `discipline` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `discipline` text;--> statement-breakpoint
ALTER TABLE `service_logs` ADD `discipline` text;--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `discipline` text;
--> statement-breakpoint
-- Includes soft-deleted history. A missing optional link is not an orphan to "repair".
CREATE TRIGGER workspace_customer_discipline_retention
BEFORE DELETE ON customer_disciplines
WHEN EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only')) AND (
 EXISTS(SELECT 1 FROM jobs WHERE customer_id=OLD.customer_id AND (discipline=OLD.discipline OR discipline IS NULL)) OR
 EXISTS(SELECT 1 FROM subscriptions WHERE customer_id=OLD.customer_id AND (discipline=OLD.discipline OR discipline IS NULL)) OR
 EXISTS(SELECT 1 FROM gardens g JOIN jobs j ON j.garden_id=g.id WHERE g.customer_id=OLD.customer_id AND (j.discipline=OLD.discipline OR j.discipline IS NULL)) OR
 EXISTS(SELECT 1 FROM gardens g JOIN garden_defects d ON d.garden_id=g.id WHERE g.customer_id=OLD.customer_id AND (d.discipline=OLD.discipline OR d.discipline IS NULL)) OR
 EXISTS(SELECT 1 FROM gardens g JOIN service_logs s ON s.garden_id=g.id WHERE g.customer_id=OLD.customer_id AND (s.discipline=OLD.discipline OR s.discipline IS NULL)) OR
 EXISTS(SELECT 1 FROM gardens g JOIN garden_discipline_data w ON w.garden_id=g.id WHERE g.customer_id=OLD.customer_id AND w.discipline=OLD.discipline AND w.notes<>'') OR
 (OLD.discipline='irrigation' AND EXISTS(SELECT 1 FROM gardens g WHERE g.customer_id=OLD.customer_id AND (g.notes<>'' OR COALESCE(g.pump_type,'')<>'' OR g.plan_key IS NOT NULL OR g.blowout<>'[]' OR EXISTS(SELECT 1 FROM shafts s WHERE s.garden_id=g.id))))
)
BEGIN SELECT RAISE(ABORT,'workspace_customer_has_work'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_job_scope_insert BEFORE INSERT ON jobs
WHEN EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only'))
BEGIN
 SELECT CASE WHEN NEW.discipline IS NULL THEN RAISE(ABORT,'workspace_job_unclassified') END;
 SELECT CASE WHEN NEW.customer_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM customer_disciplines WHERE customer_id=NEW.customer_id AND discipline=NEW.discipline) THEN RAISE(ABORT,'workspace_customer_discipline_mismatch') END;
 SELECT CASE WHEN NEW.garden_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM gardens g WHERE g.id=NEW.garden_id AND ((g.customer_id IS NOT NULL AND EXISTS(SELECT 1 FROM customer_disciplines c WHERE c.customer_id=g.customer_id AND c.discipline=NEW.discipline)) OR (g.customer_id IS NULL AND EXISTS(SELECT 1 FROM garden_disciplines gd WHERE gd.garden_id=g.id AND gd.discipline=NEW.discipline)))) THEN RAISE(ABORT,'workspace_garden_discipline_mismatch') END;
END;
--> statement-breakpoint
CREATE TRIGGER workspace_job_scope_update BEFORE UPDATE OF discipline,customer_id,garden_id ON jobs
WHEN EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only'))
BEGIN
 SELECT CASE WHEN NEW.discipline IS NOT OLD.discipline THEN RAISE(ABORT,'workspace_job_discipline_immutable') END;
 SELECT CASE WHEN NEW.customer_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM customer_disciplines WHERE customer_id=NEW.customer_id AND discipline=NEW.discipline) THEN RAISE(ABORT,'workspace_customer_discipline_mismatch') END;
 SELECT CASE WHEN NEW.garden_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM gardens g WHERE g.id=NEW.garden_id AND ((g.customer_id IS NOT NULL AND EXISTS(SELECT 1 FROM customer_disciplines c WHERE c.customer_id=g.customer_id AND c.discipline=NEW.discipline)) OR (g.customer_id IS NULL AND EXISTS(SELECT 1 FROM garden_disciplines gd WHERE gd.garden_id=g.id AND gd.discipline=NEW.discipline)))) THEN RAISE(ABORT,'workspace_garden_discipline_mismatch') END;
END;

--> statement-breakpoint
CREATE TRIGGER workspace_job_actor_insert AFTER INSERT ON jobs WHEN EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only')) AND NOT (EXISTS(SELECT 1 FROM jobs j WHERE j.id=NEW.id AND EXISTS(SELECT 1 FROM members actor WHERE actor.user_id=NEW.updated_by AND (EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only'))=0 OR (j.discipline IN ('irrigation','garden') AND (actor.role IN ('owner','administrator','admin') OR EXISTS(SELECT 1 FROM member_disciplines md WHERE md.user_id=actor.user_id AND md.discipline=j.discipline)))) AND (actor.role IN ('owner','administrator','admin') OR ((j.assigned_to=actor.user_id OR EXISTS(SELECT 1 FROM json_each(j.assigned_users) chosen WHERE chosen.value=actor.user_id)) AND j.service_approval='confirmed'))))) BEGIN SELECT RAISE(ABORT,'workspace_authorization_changed'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_shaft_actor_insert AFTER INSERT ON shafts WHEN EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only')) AND NOT (EXISTS(SELECT 1 FROM members actor WHERE actor.user_id=NEW.updated_by AND actor.role IN ('owner','administrator','admin','worker') AND ('irrigation' IN ('irrigation','garden')) AND (actor.role IN ('owner','administrator','admin') OR EXISTS(SELECT 1 FROM member_disciplines md WHERE md.user_id=actor.user_id AND md.discipline='irrigation'))) AND (NEW.garden_id IS NULL OR EXISTS(SELECT 1 FROM gardens g WHERE g.id=NEW.garden_id AND EXISTS(SELECT 1 FROM members actor WHERE actor.user_id=NEW.updated_by AND (EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only'))=0 OR actor.role IN ('owner','administrator','admin') OR (g.customer_id IS NOT NULL AND EXISTS(SELECT 1 FROM customer_disciplines cd JOIN member_disciplines md ON md.discipline=cd.discipline AND md.user_id=actor.user_id WHERE cd.customer_id=g.customer_id)) OR (g.customer_id IS NULL AND EXISTS(SELECT 1 FROM garden_disciplines gd JOIN member_disciplines md ON md.discipline=gd.discipline AND md.user_id=actor.user_id WHERE gd.garden_id=g.id))))))) BEGIN SELECT RAISE(ABORT,'workspace_authorization_changed'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_service_actor_insert AFTER INSERT ON service_logs WHEN EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only')) AND NOT (EXISTS(SELECT 1 FROM members actor WHERE actor.user_id=NEW.updated_by AND actor.role IN ('owner','administrator','admin','worker') AND (NEW.discipline IN ('irrigation','garden')) AND (actor.role IN ('owner','administrator','admin') OR EXISTS(SELECT 1 FROM member_disciplines md WHERE md.user_id=actor.user_id AND md.discipline=NEW.discipline))) AND EXISTS(SELECT 1 FROM gardens g WHERE g.id=NEW.garden_id AND EXISTS(SELECT 1 FROM members actor WHERE actor.user_id=NEW.updated_by AND (EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only'))=0 OR actor.role IN ('owner','administrator','admin') OR (g.customer_id IS NOT NULL AND EXISTS(SELECT 1 FROM customer_disciplines cd JOIN member_disciplines md ON md.discipline=cd.discipline AND md.user_id=actor.user_id WHERE cd.customer_id=g.customer_id)) OR (g.customer_id IS NULL AND EXISTS(SELECT 1 FROM garden_disciplines gd JOIN member_disciplines md ON md.discipline=gd.discipline AND md.user_id=actor.user_id WHERE gd.garden_id=g.id)))))) BEGIN SELECT RAISE(ABORT,'workspace_authorization_changed'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_report_actor_insert AFTER INSERT ON service_reports WHEN EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only')) AND NOT (EXISTS(SELECT 1 FROM jobs j WHERE j.id=NEW.job_id AND EXISTS(SELECT 1 FROM members actor WHERE actor.user_id=NEW.updated_by AND (EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only'))=0 OR (j.discipline IN ('irrigation','garden') AND (actor.role IN ('owner','administrator','admin') OR EXISTS(SELECT 1 FROM member_disciplines md WHERE md.user_id=actor.user_id AND md.discipline=j.discipline)))) AND (actor.role IN ('owner','administrator','admin') OR ((j.assigned_to=actor.user_id OR EXISTS(SELECT 1 FROM json_each(j.assigned_users) chosen WHERE chosen.value=actor.user_id)) AND j.service_approval='confirmed'))))) BEGIN SELECT RAISE(ABORT,'workspace_authorization_changed'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_notes_actor_insert AFTER INSERT ON garden_discipline_data WHEN EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only')) AND NOT (EXISTS(SELECT 1 FROM gardens g WHERE g.id=NEW.garden_id AND EXISTS(SELECT 1 FROM members actor WHERE actor.user_id=g.updated_by AND (EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only'))=0 OR actor.role IN ('owner','administrator','admin') OR (g.customer_id IS NOT NULL AND EXISTS(SELECT 1 FROM customer_disciplines cd JOIN member_disciplines md ON md.discipline=cd.discipline AND md.user_id=actor.user_id WHERE cd.customer_id=g.customer_id)) OR (g.customer_id IS NULL AND EXISTS(SELECT 1 FROM garden_disciplines gd JOIN member_disciplines md ON md.discipline=gd.discipline AND md.user_id=actor.user_id WHERE gd.garden_id=g.id)))) AND EXISTS(SELECT 1 FROM members actor WHERE actor.user_id=g.updated_by AND actor.role IN ('owner','administrator','admin','worker') AND (NEW.discipline IN ('irrigation','garden')) AND (actor.role IN ('owner','administrator','admin') OR EXISTS(SELECT 1 FROM member_disciplines md WHERE md.user_id=actor.user_id AND md.discipline=NEW.discipline))))) BEGIN SELECT RAISE(ABORT,'workspace_authorization_changed'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_job_actor_update AFTER UPDATE ON jobs WHEN EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only')) AND NOT (EXISTS(SELECT 1 FROM jobs j WHERE j.id=NEW.id AND EXISTS(SELECT 1 FROM members actor WHERE actor.user_id=NEW.updated_by AND (EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only'))=0 OR (j.discipline IN ('irrigation','garden') AND (actor.role IN ('owner','administrator','admin') OR EXISTS(SELECT 1 FROM member_disciplines md WHERE md.user_id=actor.user_id AND md.discipline=j.discipline)))) AND (actor.role IN ('owner','administrator','admin') OR ((j.assigned_to=actor.user_id OR EXISTS(SELECT 1 FROM json_each(j.assigned_users) chosen WHERE chosen.value=actor.user_id)) AND j.service_approval='confirmed'))))) BEGIN SELECT RAISE(ABORT,'workspace_authorization_changed'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_shaft_actor_update AFTER UPDATE ON shafts WHEN EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only')) AND NOT (EXISTS(SELECT 1 FROM members actor WHERE actor.user_id=NEW.updated_by AND actor.role IN ('owner','administrator','admin','worker') AND ('irrigation' IN ('irrigation','garden')) AND (actor.role IN ('owner','administrator','admin') OR EXISTS(SELECT 1 FROM member_disciplines md WHERE md.user_id=actor.user_id AND md.discipline='irrigation'))) AND (NEW.garden_id IS NULL OR EXISTS(SELECT 1 FROM gardens g WHERE g.id=NEW.garden_id AND EXISTS(SELECT 1 FROM members actor WHERE actor.user_id=NEW.updated_by AND (EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only'))=0 OR actor.role IN ('owner','administrator','admin') OR (g.customer_id IS NOT NULL AND EXISTS(SELECT 1 FROM customer_disciplines cd JOIN member_disciplines md ON md.discipline=cd.discipline AND md.user_id=actor.user_id WHERE cd.customer_id=g.customer_id)) OR (g.customer_id IS NULL AND EXISTS(SELECT 1 FROM garden_disciplines gd JOIN member_disciplines md ON md.discipline=gd.discipline AND md.user_id=actor.user_id WHERE gd.garden_id=g.id))))))) BEGIN SELECT RAISE(ABORT,'workspace_authorization_changed'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_service_actor_update AFTER UPDATE ON service_logs WHEN EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only')) AND NOT (EXISTS(SELECT 1 FROM members actor WHERE actor.user_id=NEW.updated_by AND actor.role IN ('owner','administrator','admin','worker') AND (NEW.discipline IN ('irrigation','garden')) AND (actor.role IN ('owner','administrator','admin') OR EXISTS(SELECT 1 FROM member_disciplines md WHERE md.user_id=actor.user_id AND md.discipline=NEW.discipline))) AND EXISTS(SELECT 1 FROM gardens g WHERE g.id=NEW.garden_id AND EXISTS(SELECT 1 FROM members actor WHERE actor.user_id=NEW.updated_by AND (EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only'))=0 OR actor.role IN ('owner','administrator','admin') OR (g.customer_id IS NOT NULL AND EXISTS(SELECT 1 FROM customer_disciplines cd JOIN member_disciplines md ON md.discipline=cd.discipline AND md.user_id=actor.user_id WHERE cd.customer_id=g.customer_id)) OR (g.customer_id IS NULL AND EXISTS(SELECT 1 FROM garden_disciplines gd JOIN member_disciplines md ON md.discipline=gd.discipline AND md.user_id=actor.user_id WHERE gd.garden_id=g.id)))))) BEGIN SELECT RAISE(ABORT,'workspace_authorization_changed'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_report_actor_update AFTER UPDATE ON service_reports WHEN EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only')) AND NOT (EXISTS(SELECT 1 FROM jobs j WHERE j.id=NEW.job_id AND EXISTS(SELECT 1 FROM members actor WHERE actor.user_id=NEW.updated_by AND (EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only'))=0 OR (j.discipline IN ('irrigation','garden') AND (actor.role IN ('owner','administrator','admin') OR EXISTS(SELECT 1 FROM member_disciplines md WHERE md.user_id=actor.user_id AND md.discipline=j.discipline)))) AND (actor.role IN ('owner','administrator','admin') OR ((j.assigned_to=actor.user_id OR EXISTS(SELECT 1 FROM json_each(j.assigned_users) chosen WHERE chosen.value=actor.user_id)) AND j.service_approval='confirmed'))))) BEGIN SELECT RAISE(ABORT,'workspace_authorization_changed'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_notes_actor_update AFTER UPDATE ON garden_discipline_data WHEN EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only')) AND NOT (EXISTS(SELECT 1 FROM gardens g WHERE g.id=NEW.garden_id AND EXISTS(SELECT 1 FROM members actor WHERE actor.user_id=g.updated_by AND (EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only'))=0 OR actor.role IN ('owner','administrator','admin') OR (g.customer_id IS NOT NULL AND EXISTS(SELECT 1 FROM customer_disciplines cd JOIN member_disciplines md ON md.discipline=cd.discipline AND md.user_id=actor.user_id WHERE cd.customer_id=g.customer_id)) OR (g.customer_id IS NULL AND EXISTS(SELECT 1 FROM garden_disciplines gd JOIN member_disciplines md ON md.discipline=gd.discipline AND md.user_id=actor.user_id WHERE gd.garden_id=g.id)))) AND EXISTS(SELECT 1 FROM members actor WHERE actor.user_id=g.updated_by AND actor.role IN ('owner','administrator','admin','worker') AND (NEW.discipline IN ('irrigation','garden')) AND (actor.role IN ('owner','administrator','admin') OR EXISTS(SELECT 1 FROM member_disciplines md WHERE md.user_id=actor.user_id AND md.discipline=NEW.discipline))))) BEGIN SELECT RAISE(ABORT,'workspace_authorization_changed'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_defect_event_actor AFTER INSERT ON garden_defect_events WHEN EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only')) AND NOT (EXISTS(SELECT 1 FROM garden_defects d JOIN gardens g ON g.id=d.garden_id WHERE d.id=NEW.defect_id AND EXISTS(SELECT 1 FROM members actor WHERE actor.user_id=NEW.actor_id AND (EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only'))=0 OR actor.role IN ('owner','administrator','admin') OR (g.customer_id IS NOT NULL AND EXISTS(SELECT 1 FROM customer_disciplines cd JOIN member_disciplines md ON md.discipline=cd.discipline AND md.user_id=actor.user_id WHERE cd.customer_id=g.customer_id)) OR (g.customer_id IS NULL AND EXISTS(SELECT 1 FROM garden_disciplines gd JOIN member_disciplines md ON md.discipline=gd.discipline AND md.user_id=actor.user_id WHERE gd.garden_id=g.id)))) AND EXISTS(SELECT 1 FROM members actor WHERE actor.user_id=NEW.actor_id AND actor.role IN ('owner','administrator','admin','worker') AND (d.discipline IN ('irrigation','garden')) AND (actor.role IN ('owner','administrator','admin') OR EXISTS(SELECT 1 FROM member_disciplines md WHERE md.user_id=actor.user_id AND md.discipline=d.discipline))))) BEGIN SELECT RAISE(ABORT,'workspace_authorization_changed'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_photo_actor AFTER INSERT ON service_photos WHEN EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only')) AND NOT (EXISTS(SELECT 1 FROM jobs j WHERE j.id=NEW.job_id AND EXISTS(SELECT 1 FROM members actor WHERE actor.user_id=NEW.created_by AND (EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only'))=0 OR (j.discipline IN ('irrigation','garden') AND (actor.role IN ('owner','administrator','admin') OR EXISTS(SELECT 1 FROM member_disciplines md WHERE md.user_id=actor.user_id AND md.discipline=j.discipline)))) AND (actor.role IN ('owner','administrator','admin') OR ((j.assigned_to=actor.user_id OR EXISTS(SELECT 1 FROM json_each(j.assigned_users) chosen WHERE chosen.value=actor.user_id)) AND j.service_approval='confirmed'))))) BEGIN SELECT RAISE(ABORT,'workspace_authorization_changed'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_garden_actor_update AFTER UPDATE ON gardens WHEN EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only')) AND NOT (EXISTS(SELECT 1 FROM gardens g WHERE g.id=NEW.id AND EXISTS(SELECT 1 FROM members actor WHERE actor.user_id=NEW.updated_by AND (EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only'))=0 OR actor.role IN ('owner','administrator','admin') OR (g.customer_id IS NOT NULL AND EXISTS(SELECT 1 FROM customer_disciplines cd JOIN member_disciplines md ON md.discipline=cd.discipline AND md.user_id=actor.user_id WHERE cd.customer_id=g.customer_id)) OR (g.customer_id IS NULL AND EXISTS(SELECT 1 FROM garden_disciplines gd JOIN member_disciplines md ON md.discipline=gd.discipline AND md.user_id=actor.user_id WHERE gd.garden_id=g.id))))) AND EXISTS(SELECT 1 FROM members actor WHERE actor.user_id=NEW.updated_by AND actor.role IN ('owner','administrator','admin','worker'))) BEGIN SELECT RAISE(ABORT,'workspace_authorization_changed'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_customer_classification_actor AFTER INSERT ON customer_disciplines WHEN EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only')) AND NOT (EXISTS(SELECT 1 FROM customers s WHERE s.id=NEW.customer_id AND EXISTS(SELECT 1 FROM members actor WHERE actor.user_id=COALESCE((SELECT a.actor_id FROM workspace_entity_versions v JOIN workspace_audit a ON a.operation_id=v.last_operation WHERE v.entity='customer' AND v.entity_id=NEW.customer_id),s.created_by) AND actor.role IN ('owner','administrator','admin','worker') AND (NEW.discipline IN ('irrigation','garden')) AND (actor.role IN ('owner','administrator','admin') OR EXISTS(SELECT 1 FROM member_disciplines md WHERE md.user_id=actor.user_id AND md.discipline=NEW.discipline))))) BEGIN SELECT RAISE(ABORT,'workspace_authorization_changed'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_garden_classification_actor AFTER INSERT ON garden_disciplines WHEN EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only')) AND NOT (EXISTS(SELECT 1 FROM gardens s WHERE s.id=NEW.garden_id AND EXISTS(SELECT 1 FROM members actor WHERE actor.user_id=COALESCE((SELECT a.actor_id FROM workspace_entity_versions v JOIN workspace_audit a ON a.operation_id=v.last_operation WHERE v.entity='garden' AND v.entity_id=NEW.garden_id),s.created_by) AND actor.role IN ('owner','administrator','admin','worker') AND (NEW.discipline IN ('irrigation','garden')) AND (actor.role IN ('owner','administrator','admin') OR EXISTS(SELECT 1 FROM member_disciplines md WHERE md.user_id=actor.user_id AND md.discipline=NEW.discipline))))) BEGIN SELECT RAISE(ABORT,'workspace_authorization_changed'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_job_assignee_insert AFTER INSERT ON jobs
WHEN EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only')) AND EXISTS(
 SELECT 1 FROM (SELECT NEW.assigned_to user_id WHERE NEW.assigned_to<>'' UNION SELECT value FROM json_each(NEW.assigned_users)) chosen
 LEFT JOIN members target ON target.user_id=chosen.user_id
 WHERE target.user_id IS NULL OR (target.role NOT IN ('owner','administrator','admin') AND NOT EXISTS(SELECT 1 FROM member_disciplines md WHERE md.user_id=target.user_id AND md.discipline=NEW.discipline)))
BEGIN SELECT RAISE(ABORT,'workspace_assignee_discipline'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_job_assignee_update AFTER UPDATE OF assigned_to,assigned_users,discipline ON jobs
WHEN EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only')) AND EXISTS(
 SELECT 1 FROM (SELECT NEW.assigned_to user_id WHERE NEW.assigned_to<>'' UNION SELECT value FROM json_each(NEW.assigned_users)) chosen
 LEFT JOIN members target ON target.user_id=chosen.user_id
 WHERE target.user_id IS NULL OR (target.role NOT IN ('owner','administrator','admin') AND NOT EXISTS(SELECT 1 FROM member_disciplines md WHERE md.user_id=target.user_id AND md.discipline=NEW.discipline)))
BEGIN SELECT RAISE(ABORT,'workspace_assignee_discipline'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_garden_irrigation_fields_update AFTER UPDATE ON gardens
WHEN EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only')) AND
 (NEW.notes IS NOT OLD.notes OR NEW.pump_type IS NOT OLD.pump_type OR NEW.plan_key IS NOT OLD.plan_key OR NEW.plan_markers IS NOT OLD.plan_markers OR NEW.blowout IS NOT OLD.blowout) AND
 NOT EXISTS(SELECT 1 FROM members actor WHERE actor.user_id=NEW.updated_by AND (actor.role IN ('owner','administrator','admin') OR EXISTS(SELECT 1 FROM member_disciplines md WHERE md.user_id=actor.user_id AND md.discipline='irrigation')))
BEGIN SELECT RAISE(ABORT,'workspace_irrigation_only'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_role_revision_update AFTER UPDATE OF role ON members
WHEN EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only')) AND NEW.role<>OLD.role
BEGIN UPDATE workspaces SET authorization_revision=authorization_revision+1; END;
--> statement-breakpoint
CREATE TRIGGER workspace_role_revision_delete AFTER DELETE ON members
WHEN EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only'))
BEGIN UPDATE workspaces SET authorization_revision=authorization_revision+1; END;
