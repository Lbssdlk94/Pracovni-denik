CREATE TABLE `job_handoff_events` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`user_id` text NOT NULL,
	`revision` integer NOT NULL,
	`status` text NOT NULL,
	`note` text NOT NULL,
	`kind` text NOT NULL,
	`actor_id` text NOT NULL,
	`actor_name` text NOT NULL,
	`at` integer NOT NULL,
	`hash` text,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `job_handoff_events_job_idx` ON `job_handoff_events` (`job_id`,`at`);--> statement-breakpoint
CREATE TABLE `job_handoffs` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`user_id` text NOT NULL,
	`revision` integer NOT NULL,
	`status` text NOT NULL,
	`note` text NOT NULL,
	`responded_at` integer,
	`responded_by` text,
	`version` integer NOT NULL,
	`last_operation` text,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `job_handoffs_job_user_idx` ON `job_handoffs` (`job_id`,`user_id`);--> statement-breakpoint
ALTER TABLE `jobs` ADD `planned_start` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `jobs` ADD `estimated_minutes` integer;--> statement-breakpoint
ALTER TABLE `jobs` ADD `arrival_window_start` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `jobs` ADD `arrival_window_end` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `jobs` ADD `handoff_revision` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
CREATE TRIGGER job_handoff_created AFTER INSERT ON jobs WHEN NEW.deleted=0 AND NEW.service_approval='confirmed' AND NEW.status<>'done' BEGIN
INSERT INTO job_handoffs(id,job_id,user_id,revision,status,note,version) SELECT lower(hex(randomblob(16))),NEW.id,target.user_id,NEW.handoff_revision,'pending','',1 FROM (SELECT member.user_id FROM members member WHERE member.user_id=NEW.assigned_to OR EXISTS(SELECT 1 FROM json_each(NEW.assigned_users) selected WHERE selected.value=member.user_id)) target WHERE 1 ON CONFLICT(job_id,user_id) DO UPDATE SET revision=excluded.revision,status='pending',note='',responded_at=NULL,responded_by=NULL,version=job_handoffs.version+1,last_operation=NULL;
END;
--> statement-breakpoint
CREATE TRIGGER job_handoff_changed AFTER UPDATE OF due_date,start_time,end_time,planned_start,estimated_minutes,arrival_window_start,arrival_window_end,assigned_to,assigned_users,title,job_type,description,garden_id,customer_id,customer_address_id,customer_name,city,address,service_approval,status ON jobs WHEN NEW.deleted=0 AND NEW.service_approval='confirmed' AND NEW.status<>'done' AND (NEW.due_date IS NOT OLD.due_date OR NEW.start_time IS NOT OLD.start_time OR NEW.end_time IS NOT OLD.end_time OR NEW.planned_start IS NOT OLD.planned_start OR NEW.estimated_minutes IS NOT OLD.estimated_minutes OR NEW.arrival_window_start IS NOT OLD.arrival_window_start OR NEW.arrival_window_end IS NOT OLD.arrival_window_end OR NEW.assigned_to IS NOT OLD.assigned_to OR NEW.assigned_users IS NOT OLD.assigned_users OR NEW.title IS NOT OLD.title OR NEW.job_type IS NOT OLD.job_type OR NEW.city IS NOT OLD.city OR NEW.customer_address_id IS NOT OLD.customer_address_id OR NEW.description IS NOT OLD.description OR NEW.garden_id IS NOT OLD.garden_id OR NEW.customer_id IS NOT OLD.customer_id OR NEW.customer_name IS NOT OLD.customer_name OR NEW.address IS NOT OLD.address OR NEW.service_approval IS NOT OLD.service_approval OR OLD.status='done') BEGIN
UPDATE jobs SET handoff_revision=OLD.handoff_revision+1 WHERE id=NEW.id;
INSERT INTO job_handoffs(id,job_id,user_id,revision,status,note,version) SELECT lower(hex(randomblob(16))),NEW.id,target.user_id,OLD.handoff_revision+1,'pending','',1 FROM (SELECT member.user_id FROM members member WHERE member.user_id=NEW.assigned_to OR EXISTS(SELECT 1 FROM json_each(NEW.assigned_users) selected WHERE selected.value=member.user_id)) target WHERE 1 ON CONFLICT(job_id,user_id) DO UPDATE SET revision=excluded.revision,status='pending',note='',responded_at=NULL,responded_by=NULL,version=job_handoffs.version+1,last_operation=NULL;
INSERT INTO job_handoff_events(id,job_id,user_id,revision,status,note,kind,actor_id,actor_name,at) SELECT lower(hex(randomblob(16))),NEW.id,target.user_id,OLD.handoff_revision+1,'pending','','requested',NEW.updated_by,COALESCE((SELECT name FROM members WHERE user_id=NEW.updated_by),NEW.updated_by),NEW.updated_at FROM (SELECT member.user_id FROM members member WHERE member.user_id=NEW.assigned_to OR EXISTS(SELECT 1 FROM json_each(NEW.assigned_users) selected WHERE selected.value=member.user_id)) target;
INSERT OR IGNORE INTO notifications(id,event_key,user_id,kind,resource_id,title,body,created_at) SELECT lower(hex(randomblob(16))),'job:'||NEW.id||':'||NEW.version||':assigned',target.user_id,'job_assigned',NEW.id,'Změna zakázky – potvrďte převzetí',NEW.title||' · Zkontrolujte termín, přiřazení a zadání.',NEW.updated_at FROM (SELECT member.user_id FROM members member WHERE member.user_id=NEW.assigned_to OR EXISTS(SELECT 1 FROM json_each(NEW.assigned_users) selected WHERE selected.value=member.user_id)) target WHERE target.user_id<>NEW.updated_by AND COALESCE((SELECT json_extract(value,'$.notifications') FROM settings WHERE key='features'),1)=1;
UPDATE notifications SET title='Změna zakázky – potvrďte převzetí',body=NEW.title||' · Zkontrolujte termín, přiřazení a zadání.' WHERE event_key='job:'||NEW.id||':'||NEW.version||':assigned' AND kind='job_assigned';
END;
