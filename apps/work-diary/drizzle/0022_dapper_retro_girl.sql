ALTER TABLE `jobs` ADD `job_type` text DEFAULT 'service' NOT NULL;
--> statement-breakpoint
CREATE TRIGGER notify_job_type_changed AFTER UPDATE OF job_type ON jobs
WHEN NEW.deleted=0 AND NEW.service_approval='confirmed' AND NEW.job_type<>OLD.job_type
 AND COALESCE((SELECT json_extract(value,'$.notifications') FROM settings WHERE key='features'),1)=1
 AND COALESCE((SELECT json_extract(value,'$.jobs') FROM settings WHERE key='features'),1)=1
BEGIN
 INSERT OR IGNORE INTO notifications(id,event_key,user_id,kind,resource_id,title,body,created_at)
 SELECT lower(hex(randomblob(16))),'job:'||NEW.id||':'||NEW.version||':assigned',user_id,'job_assigned',NEW.id,'Změna druhu zakázky',NEW.title,NEW.updated_at FROM members WHERE (user_id=NEW.assigned_to OR user_id IN (SELECT value FROM json_each(NEW.assigned_users))) AND user_id<>NEW.updated_by;
END;
