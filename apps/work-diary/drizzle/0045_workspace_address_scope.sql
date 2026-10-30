CREATE TABLE `workspace_garden_addresses` (
	`garden_id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`customer_address_id` text NOT NULL,
	`city` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`garden_id`) REFERENCES `gardens`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade
);

--> statement-breakpoint
CREATE TRIGGER workspace_address_job_insert AFTER INSERT ON jobs BEGIN
DELETE FROM workspace_garden_addresses WHERE garden_id IN (NEW.garden_id);
INSERT INTO workspace_garden_addresses(garden_id,customer_id,customer_address_id,city)
SELECT g.id,g.customer_id,MIN(j.customer_address_id),CASE WHEN COUNT(DISTINCT NULLIF(j.city,''))=1 THEN MIN(NULLIF(j.city,'')) ELSE '' END
FROM gardens g JOIN customers c ON c.id=g.customer_id JOIN jobs j ON j.garden_id=g.id AND j.customer_id=g.customer_id
WHERE j.deleted=0 AND j.customer_address_id IS NOT NULL  AND g.id IN (NEW.garden_id)
GROUP BY g.id,g.customer_id HAVING COUNT(DISTINCT j.customer_address_id)=1 AND MIN(CASE WHEN EXISTS(SELECT 1 FROM json_each(c.addresses) a WHERE json_extract(a.value,'$.id')=j.customer_address_id) THEN 1 ELSE 0 END)=1;
END;
--> statement-breakpoint
CREATE TRIGGER workspace_address_job_update AFTER UPDATE OF garden_id,customer_id,customer_address_id,city,deleted ON jobs BEGIN
DELETE FROM workspace_garden_addresses WHERE garden_id IN (OLD.garden_id,NEW.garden_id);
INSERT INTO workspace_garden_addresses(garden_id,customer_id,customer_address_id,city)
SELECT g.id,g.customer_id,MIN(j.customer_address_id),CASE WHEN COUNT(DISTINCT NULLIF(j.city,''))=1 THEN MIN(NULLIF(j.city,'')) ELSE '' END
FROM gardens g JOIN customers c ON c.id=g.customer_id JOIN jobs j ON j.garden_id=g.id AND j.customer_id=g.customer_id
WHERE j.deleted=0 AND j.customer_address_id IS NOT NULL  AND g.id IN (OLD.garden_id,NEW.garden_id)
GROUP BY g.id,g.customer_id HAVING COUNT(DISTINCT j.customer_address_id)=1 AND MIN(CASE WHEN EXISTS(SELECT 1 FROM json_each(c.addresses) a WHERE json_extract(a.value,'$.id')=j.customer_address_id) THEN 1 ELSE 0 END)=1;
END;
--> statement-breakpoint
CREATE TRIGGER workspace_address_job_delete AFTER DELETE ON jobs BEGIN
DELETE FROM workspace_garden_addresses WHERE garden_id IN (OLD.garden_id);
INSERT INTO workspace_garden_addresses(garden_id,customer_id,customer_address_id,city)
SELECT g.id,g.customer_id,MIN(j.customer_address_id),CASE WHEN COUNT(DISTINCT NULLIF(j.city,''))=1 THEN MIN(NULLIF(j.city,'')) ELSE '' END
FROM gardens g JOIN customers c ON c.id=g.customer_id JOIN jobs j ON j.garden_id=g.id AND j.customer_id=g.customer_id
WHERE j.deleted=0 AND j.customer_address_id IS NOT NULL  AND g.id IN (OLD.garden_id)
GROUP BY g.id,g.customer_id HAVING COUNT(DISTINCT j.customer_address_id)=1 AND MIN(CASE WHEN EXISTS(SELECT 1 FROM json_each(c.addresses) a WHERE json_extract(a.value,'$.id')=j.customer_address_id) THEN 1 ELSE 0 END)=1;
END;
--> statement-breakpoint
CREATE TRIGGER workspace_address_garden_relink AFTER UPDATE OF customer_id ON gardens
WHEN NEW.customer_id IS NOT OLD.customer_id BEGIN DELETE FROM workspace_garden_addresses WHERE garden_id=NEW.id; END;
--> statement-breakpoint
CREATE TRIGGER workspace_garden_visibility_revision AFTER UPDATE OF customer_id,deleted ON gardens
WHEN NEW.customer_id IS NOT OLD.customer_id OR NEW.deleted<>OLD.deleted
BEGIN UPDATE workspaces SET authorization_revision=authorization_revision+1,updated_at=NEW.updated_at; END;
--> statement-breakpoint
CREATE TRIGGER workspace_customer_visibility_revision AFTER UPDATE OF deleted ON customers WHEN NEW.deleted<>OLD.deleted
BEGIN UPDATE workspaces SET authorization_revision=authorization_revision+1,updated_at=NEW.updated_at; END;
--> statement-breakpoint
CREATE TRIGGER workspace_garden_discipline_retention BEFORE DELETE ON garden_disciplines
WHEN EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only')) AND
EXISTS(SELECT 1 FROM gardens WHERE id=OLD.garden_id AND customer_id IS NULL) AND (
 EXISTS(SELECT 1 FROM jobs WHERE garden_id=OLD.garden_id AND (discipline=OLD.discipline OR discipline IS NULL)) OR
 EXISTS(SELECT 1 FROM garden_defects WHERE garden_id=OLD.garden_id AND (discipline=OLD.discipline OR discipline IS NULL)) OR
 EXISTS(SELECT 1 FROM service_logs WHERE garden_id=OLD.garden_id AND (discipline=OLD.discipline OR discipline IS NULL)) OR
 EXISTS(SELECT 1 FROM garden_discipline_data WHERE garden_id=OLD.garden_id AND discipline=OLD.discipline AND notes<>'') OR
 (OLD.discipline='irrigation' AND (EXISTS(SELECT 1 FROM shafts WHERE garden_id=OLD.garden_id) OR EXISTS(SELECT 1 FROM gardens WHERE id=OLD.garden_id AND (notes<>'' OR pump_type<>'' OR plan_key IS NOT NULL OR blowout<>'[]'))))
) BEGIN SELECT RAISE(ABORT,'workspace_garden_has_work'); END;

--> statement-breakpoint
CREATE TRIGGER workspace_garden_defects_references_insert BEFORE INSERT ON garden_defects
WHEN EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only')) AND (NEW.discipline IS NULL OR (NEW.source_job_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jobs WHERE id=NEW.source_job_id AND garden_id=NEW.garden_id AND discipline=NEW.discipline)))
BEGIN SELECT RAISE(ABORT,'workspace_work_reference_mismatch'); END;

--> statement-breakpoint
CREATE TRIGGER workspace_garden_defects_references_update BEFORE UPDATE OF discipline,garden_id,source_job_id ON garden_defects
WHEN EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only')) AND (NEW.discipline IS NULL OR (NEW.source_job_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jobs WHERE id=NEW.source_job_id AND garden_id=NEW.garden_id AND discipline=NEW.discipline)))
BEGIN SELECT RAISE(ABORT,'workspace_work_reference_mismatch'); END;

--> statement-breakpoint
CREATE TRIGGER workspace_garden_defect_jobs_references_insert BEFORE INSERT ON garden_defect_jobs
WHEN EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only')) AND (NOT EXISTS(SELECT 1 FROM garden_defects d JOIN jobs j ON j.id=NEW.job_id AND j.garden_id=d.garden_id AND j.discipline=d.discipline WHERE d.id=NEW.defect_id))
BEGIN SELECT RAISE(ABORT,'workspace_work_reference_mismatch'); END;

--> statement-breakpoint
CREATE TRIGGER workspace_garden_defect_jobs_references_update BEFORE UPDATE OF defect_id,job_id ON garden_defect_jobs
WHEN EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only')) AND (NOT EXISTS(SELECT 1 FROM garden_defects d JOIN jobs j ON j.id=NEW.job_id AND j.garden_id=d.garden_id AND j.discipline=d.discipline WHERE d.id=NEW.defect_id))
BEGIN SELECT RAISE(ABORT,'workspace_work_reference_mismatch'); END;

--> statement-breakpoint
CREATE TRIGGER workspace_jobs_references_insert BEFORE INSERT ON jobs
WHEN EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only')) AND (NEW.service_period_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM subscription_periods p JOIN subscriptions s ON s.id=p.subscription_id WHERE p.id=NEW.service_period_id AND s.discipline=NEW.discipline))
BEGIN SELECT RAISE(ABORT,'workspace_work_reference_mismatch'); END;

--> statement-breakpoint
CREATE TRIGGER workspace_jobs_references_update BEFORE UPDATE OF discipline,service_period_id ON jobs
WHEN EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only')) AND (NEW.service_period_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM subscription_periods p JOIN subscriptions s ON s.id=p.subscription_id WHERE p.id=NEW.service_period_id AND s.discipline=NEW.discipline))
BEGIN SELECT RAISE(ABORT,'workspace_work_reference_mismatch'); END;

--> statement-breakpoint
CREATE TRIGGER workspace_garden_defects_garden_insert BEFORE INSERT ON garden_defects
WHEN EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only')) AND NOT EXISTS(
 SELECT 1 FROM gardens g WHERE g.id=NEW.garden_id AND ((g.customer_id IS NOT NULL AND EXISTS(SELECT 1 FROM customer_disciplines c WHERE c.customer_id=g.customer_id AND c.discipline=NEW.discipline)) OR (g.customer_id IS NULL AND EXISTS(SELECT 1 FROM garden_disciplines d WHERE d.garden_id=g.id AND d.discipline=NEW.discipline)))
) BEGIN SELECT RAISE(ABORT,'workspace_garden_discipline_mismatch'); END;

--> statement-breakpoint
CREATE TRIGGER workspace_garden_defects_garden_update BEFORE UPDATE OF discipline,garden_id ON garden_defects
WHEN EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only')) AND NOT EXISTS(
 SELECT 1 FROM gardens g WHERE g.id=NEW.garden_id AND ((g.customer_id IS NOT NULL AND EXISTS(SELECT 1 FROM customer_disciplines c WHERE c.customer_id=g.customer_id AND c.discipline=NEW.discipline)) OR (g.customer_id IS NULL AND EXISTS(SELECT 1 FROM garden_disciplines d WHERE d.garden_id=g.id AND d.discipline=NEW.discipline)))
) BEGIN SELECT RAISE(ABORT,'workspace_garden_discipline_mismatch'); END;

--> statement-breakpoint
CREATE TRIGGER workspace_service_logs_garden_insert BEFORE INSERT ON service_logs
WHEN EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only')) AND NOT EXISTS(
 SELECT 1 FROM gardens g WHERE g.id=NEW.garden_id AND ((g.customer_id IS NOT NULL AND EXISTS(SELECT 1 FROM customer_disciplines c WHERE c.customer_id=g.customer_id AND c.discipline=NEW.discipline)) OR (g.customer_id IS NULL AND EXISTS(SELECT 1 FROM garden_disciplines d WHERE d.garden_id=g.id AND d.discipline=NEW.discipline)))
) BEGIN SELECT RAISE(ABORT,'workspace_garden_discipline_mismatch'); END;

--> statement-breakpoint
CREATE TRIGGER workspace_service_logs_garden_update BEFORE UPDATE OF discipline,garden_id ON service_logs
WHEN EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only')) AND NOT EXISTS(
 SELECT 1 FROM gardens g WHERE g.id=NEW.garden_id AND ((g.customer_id IS NOT NULL AND EXISTS(SELECT 1 FROM customer_disciplines c WHERE c.customer_id=g.customer_id AND c.discipline=NEW.discipline)) OR (g.customer_id IS NULL AND EXISTS(SELECT 1 FROM garden_disciplines d WHERE d.garden_id=g.id AND d.discipline=NEW.discipline)))
) BEGIN SELECT RAISE(ABORT,'workspace_garden_discipline_mismatch'); END;

--> statement-breakpoint
CREATE TRIGGER workspace_garden_discipline_data_garden_insert BEFORE INSERT ON garden_discipline_data
WHEN EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only')) AND NOT EXISTS(
 SELECT 1 FROM gardens g WHERE g.id=NEW.garden_id AND ((g.customer_id IS NOT NULL AND EXISTS(SELECT 1 FROM customer_disciplines c WHERE c.customer_id=g.customer_id AND c.discipline=NEW.discipline)) OR (g.customer_id IS NULL AND EXISTS(SELECT 1 FROM garden_disciplines d WHERE d.garden_id=g.id AND d.discipline=NEW.discipline)))
) BEGIN SELECT RAISE(ABORT,'workspace_garden_discipline_mismatch'); END;

--> statement-breakpoint
CREATE TRIGGER workspace_garden_discipline_data_garden_update BEFORE UPDATE OF discipline,garden_id ON garden_discipline_data
WHEN EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only')) AND NOT EXISTS(
 SELECT 1 FROM gardens g WHERE g.id=NEW.garden_id AND ((g.customer_id IS NOT NULL AND EXISTS(SELECT 1 FROM customer_disciplines c WHERE c.customer_id=g.customer_id AND c.discipline=NEW.discipline)) OR (g.customer_id IS NULL AND EXISTS(SELECT 1 FROM garden_disciplines d WHERE d.garden_id=g.id AND d.discipline=NEW.discipline)))
) BEGIN SELECT RAISE(ABORT,'workspace_garden_discipline_mismatch'); END;

--> statement-breakpoint
CREATE TRIGGER workspace_defect_photos_insert BEFORE INSERT ON garden_defects
WHEN EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only')) AND EXISTS(
 SELECT 1 FROM json_each(NEW.photos) p WHERE NOT EXISTS(SELECT 1 FROM jobs j WHERE j.id=json_extract(p.value,'$.jobId') AND j.garden_id=NEW.garden_id AND j.discipline=NEW.discipline)
) BEGIN SELECT RAISE(ABORT,'workspace_photo_discipline_mismatch'); END;

--> statement-breakpoint
CREATE TRIGGER workspace_defect_photos_update BEFORE UPDATE OF discipline,garden_id,photos ON garden_defects
WHEN EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only')) AND EXISTS(
 SELECT 1 FROM json_each(NEW.photos) p WHERE NOT EXISTS(SELECT 1 FROM jobs j WHERE j.id=json_extract(p.value,'$.jobId') AND j.garden_id=NEW.garden_id AND j.discipline=NEW.discipline)
) BEGIN SELECT RAISE(ABORT,'workspace_photo_discipline_mismatch'); END;
