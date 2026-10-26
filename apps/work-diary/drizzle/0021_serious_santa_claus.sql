ALTER TABLE `jobs` ADD `assigned_users` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
DROP TRIGGER notify_job_created;
--> statement-breakpoint
CREATE TRIGGER notify_job_created AFTER INSERT ON jobs
WHEN NEW.deleted=0 AND NEW.service_approval='confirmed' AND COALESCE((SELECT json_extract(value,'$.notifications') FROM settings WHERE key='features'),1)=1 AND COALESCE((SELECT json_extract(value,'$.jobs') FROM settings WHERE key='features'),1)=1
BEGIN
 INSERT OR IGNORE INTO notifications(id,event_key,user_id,kind,resource_id,title,body,created_at)
 SELECT lower(hex(randomblob(16))),'job:'||NEW.id||':'||NEW.version||':assigned',user_id,'job_assigned',NEW.id,'Nová zakázka',NEW.title,NEW.updated_at FROM members WHERE (user_id=NEW.assigned_to OR user_id IN (SELECT value FROM json_each(NEW.assigned_users))) AND user_id<>NEW.updated_by;
END;

--> statement-breakpoint
DROP TRIGGER notify_job_changed;
--> statement-breakpoint
CREATE TRIGGER notify_job_changed AFTER UPDATE ON jobs
WHEN NEW.deleted=0 AND NEW.service_approval='confirmed' AND COALESCE((SELECT json_extract(value,'$.notifications') FROM settings WHERE key='features'),1)=1 AND COALESCE((SELECT json_extract(value,'$.jobs') FROM settings WHERE key='features'),1)=1
BEGIN
 INSERT OR IGNORE INTO notifications(id,event_key,user_id,kind,resource_id,title,body,created_at)
 SELECT lower(hex(randomblob(16))),'job:'||NEW.id||':'||NEW.version||':assigned',user_id,'job_assigned',NEW.id,CASE WHEN NEW.assigned_to<>OLD.assigned_to THEN 'Přiřazená zakázka' ELSE 'Změna zakázky' END,NEW.title,NEW.updated_at FROM members
 WHERE (user_id=NEW.assigned_to OR user_id IN (SELECT value FROM json_each(NEW.assigned_users))) AND user_id<>NEW.updated_by AND (NEW.service_approval<>OLD.service_approval OR NEW.assigned_to<>OLD.assigned_to OR NEW.assigned_users<>OLD.assigned_users OR NEW.title<>OLD.title OR NEW.description<>OLD.description OR NEW.address<>OLD.address OR NEW.garden_id IS NOT OLD.garden_id OR NEW.due_date<>OLD.due_date OR NEW.customer_name<>OLD.customer_name OR NEW.city<>OLD.city OR NEW.status<>OLD.status OR NEW.incomplete_reason<>OLD.incomplete_reason);
 INSERT OR IGNORE INTO notifications(id,event_key,user_id,kind,resource_id,title,body,created_at)
 SELECT lower(hex(randomblob(16))),'job:'||NEW.id||':'||NEW.version||':status',user_id,'job_status',NEW.id,'Změna stavu zakázky',NEW.title||' · '||CASE NEW.status WHEN 'planned' THEN 'Naplánováno' WHEN 'in_progress' THEN 'Probíhá' WHEN 'done' THEN 'Hotovo' ELSE 'Nedokončeno' END,NEW.updated_at FROM members
 WHERE role IN ('owner','admin') AND user_id<>NEW.updated_by AND (NEW.status<>OLD.status OR NEW.incomplete_reason<>OLD.incomplete_reason);
END;

--> statement-breakpoint
DROP TRIGGER notify_job_rescheduled;
--> statement-breakpoint
CREATE TRIGGER notify_job_rescheduled AFTER UPDATE OF start_time,end_time ON jobs
WHEN NEW.deleted=0 AND NEW.service_approval='confirmed' AND (NEW.start_time<>OLD.start_time OR NEW.end_time<>OLD.end_time)
 AND COALESCE((SELECT json_extract(value,'$.notifications') FROM settings WHERE key='features'),1)=1
 AND COALESCE((SELECT json_extract(value,'$.jobs') FROM settings WHERE key='features'),1)=1
BEGIN
 INSERT OR IGNORE INTO notifications(id,event_key,user_id,kind,resource_id,title,body,created_at)
 SELECT lower(hex(randomblob(16))),'job:'||NEW.id||':'||NEW.version||':assigned',user_id,'job_assigned',NEW.id,'Změna termínu zakázky',NEW.title,NEW.updated_at FROM members WHERE (user_id=NEW.assigned_to OR user_id IN (SELECT value FROM json_each(NEW.assigned_users))) AND user_id<>NEW.updated_by;
END;


