ALTER TABLE `jobs` ADD `start_time` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `jobs` ADD `end_time` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `jobs_schedule_idx` ON `jobs` (`deleted`,`due_date`,`start_time`,`id`);--> statement-breakpoint
CREATE INDEX `jobs_assigned_schedule_idx` ON `jobs` (`assigned_to`,`deleted`,`due_date`,`start_time`,`id`);--> statement-breakpoint
-- Recover unambiguous, dated legacy imports without changing their titles.
UPDATE jobs SET start_time=substr(title,1,5),end_time=substr(title,7,5)
WHERE deleted=0 AND due_date<>'' AND start_time='' AND end_time=''
 AND substr(title,1,5) GLOB '[0-2][0-9]:[0-5][0-9]'
 AND substr(title,7,5) GLOB '[0-2][0-9]:[0-5][0-9]'
 AND substr(title,1,2)<='23' AND substr(title,7,2)<='23'
 AND substr(title,6,1)='–' AND substr(title,12,3)=' · '
 AND substr(title,1,5)<substr(title,7,5);
--> statement-breakpoint
-- Share the existing event key so a date+time edit sends one notification.
CREATE TRIGGER notify_job_rescheduled AFTER UPDATE OF start_time,end_time ON jobs
WHEN NEW.deleted=0 AND (NEW.start_time<>OLD.start_time OR NEW.end_time<>OLD.end_time)
 AND COALESCE((SELECT json_extract(value,'$.notifications') FROM settings WHERE key='features'),1)=1
 AND COALESCE((SELECT json_extract(value,'$.jobs') FROM settings WHERE key='features'),1)=1
BEGIN
 INSERT OR IGNORE INTO notifications(id,event_key,user_id,kind,resource_id,title,body,created_at)
 SELECT lower(hex(randomblob(16))),'job:'||NEW.id||':'||NEW.version||':assigned',user_id,'job_assigned',NEW.id,'Změna termínu zakázky',NEW.title,NEW.updated_at FROM members WHERE user_id=NEW.assigned_to AND user_id<>NEW.updated_by;
END;
