ALTER TABLE `service_photos` ADD `gallery_upload` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `service_photos` ADD `gallery_thumbnail_key` text;--> statement-breakpoint
ALTER TABLE `service_photos` ADD `gallery_category` text;--> statement-breakpoint
ALTER TABLE `service_photos` ADD `gallery_note` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `service_photos` ADD `gallery_version` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
DROP TRIGGER workspace_service_photos_licensed_insert;
--> statement-breakpoint
CREATE TRIGGER workspace_service_photos_licensed_insert BEFORE INSERT ON service_photos
WHEN EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only')) AND NOT EXISTS(
 SELECT 1 FROM workspace_organizations o JOIN workspace_organization_policies p ON p.organization_id=o.id
 WHERE o.discipline=(SELECT discipline FROM jobs WHERE id=NEW.job_id)
 AND p.active=1 AND p.expires_at>CAST(strftime('%s','now') AS INTEGER)*1000
 AND json_extract(p.features,'$.jobs')=1 AND json_extract(p.features,'$.photoUploads')=1
 AND ((NEW.gallery_upload=1 AND json_extract(p.features,'$.drivePhotos')=1)
 OR (NEW.gallery_upload=0 AND json_extract(p.features,'$.protocolPhotos')=1))
) BEGIN SELECT RAISE(ABORT,'workspace_feature_disabled'); END;

--> statement-breakpoint
DROP TRIGGER workspace_service_photos_licensed_update;
--> statement-breakpoint
CREATE TRIGGER workspace_service_photos_licensed_update BEFORE UPDATE OF job_id,status,gallery_upload ON service_photos
WHEN EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only')) AND NOT EXISTS(
 SELECT 1 FROM workspace_organizations o JOIN workspace_organization_policies p ON p.organization_id=o.id
 WHERE o.discipline=(SELECT discipline FROM jobs WHERE id=NEW.job_id)
 AND p.active=1 AND p.expires_at>CAST(strftime('%s','now') AS INTEGER)*1000
 AND json_extract(p.features,'$.jobs')=1 AND json_extract(p.features,'$.photoUploads')=1
 AND ((NEW.gallery_upload=1 AND json_extract(p.features,'$.drivePhotos')=1)
 OR (NEW.gallery_upload=0 AND json_extract(p.features,'$.protocolPhotos')=1))
) BEGIN SELECT RAISE(ABORT,'workspace_feature_disabled'); END;
