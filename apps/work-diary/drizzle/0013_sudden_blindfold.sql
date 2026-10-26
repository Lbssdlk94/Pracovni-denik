CREATE TABLE `notification_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`jobs` integer DEFAULT 1 NOT NULL,
	`attendance` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `members`(`user_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`event_key` text NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`resource_id` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	`read_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `members`(`user_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notifications_event_user_idx` ON `notifications` (`event_key`,`user_id`);--> statement-breakpoint
CREATE INDEX `notifications_user_created_idx` ON `notifications` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `push_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`notification_id` text NOT NULL,
	`subscription_id` text NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer DEFAULT 0 NOT NULL,
	`lease_token` text,
	`lease_until` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`notification_id`) REFERENCES `notifications`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`subscription_id`) REFERENCES `push_subscriptions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `push_deliveries_pending_idx` ON `push_deliveries` (`state`,`next_attempt_at`);--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `members`(`user_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscriptions_endpoint_unique` ON `push_subscriptions` (`endpoint`);--> statement-breakpoint
CREATE INDEX `push_subscriptions_user_idx` ON `push_subscriptions` (`user_id`);--> statement-breakpoint
-- Inbox entries are committed atomically with the business change, even if the request dies.
CREATE TRIGGER notify_job_created AFTER INSERT ON jobs
WHEN NEW.deleted=0 AND COALESCE((SELECT json_extract(value,'$.notifications') FROM settings WHERE key='features'),1)=1 AND COALESCE((SELECT json_extract(value,'$.jobs') FROM settings WHERE key='features'),1)=1
BEGIN
 INSERT OR IGNORE INTO notifications(id,event_key,user_id,kind,resource_id,title,body,created_at)
 SELECT lower(hex(randomblob(16))),'job:'||NEW.id||':'||NEW.version||':assigned',user_id,'job_assigned',NEW.id,'Nová zakázka',NEW.title,NEW.updated_at FROM members WHERE user_id=NEW.assigned_to AND user_id<>NEW.updated_by;
END;
--> statement-breakpoint
CREATE TRIGGER notify_job_changed AFTER UPDATE ON jobs
WHEN NEW.deleted=0 AND COALESCE((SELECT json_extract(value,'$.notifications') FROM settings WHERE key='features'),1)=1 AND COALESCE((SELECT json_extract(value,'$.jobs') FROM settings WHERE key='features'),1)=1
BEGIN
 INSERT OR IGNORE INTO notifications(id,event_key,user_id,kind,resource_id,title,body,created_at)
 SELECT lower(hex(randomblob(16))),'job:'||NEW.id||':'||NEW.version||':assigned',user_id,'job_assigned',NEW.id,CASE WHEN NEW.assigned_to<>OLD.assigned_to THEN 'Přiřazená zakázka' ELSE 'Změna zakázky' END,NEW.title,NEW.updated_at FROM members
 WHERE user_id=NEW.assigned_to AND user_id<>NEW.updated_by AND (NEW.assigned_to<>OLD.assigned_to OR NEW.title<>OLD.title OR NEW.description<>OLD.description OR NEW.address<>OLD.address OR NEW.garden_id IS NOT OLD.garden_id OR NEW.due_date<>OLD.due_date OR NEW.customer_name<>OLD.customer_name OR NEW.city<>OLD.city OR NEW.status<>OLD.status OR NEW.incomplete_reason<>OLD.incomplete_reason);
 INSERT OR IGNORE INTO notifications(id,event_key,user_id,kind,resource_id,title,body,created_at)
 SELECT lower(hex(randomblob(16))),'job:'||NEW.id||':'||NEW.version||':status',user_id,'job_status',NEW.id,'Změna stavu zakázky',NEW.title||' · '||CASE NEW.status WHEN 'planned' THEN 'Naplánováno' WHEN 'in_progress' THEN 'Probíhá' WHEN 'done' THEN 'Hotovo' ELSE 'Nedokončeno' END,NEW.updated_at FROM members
 WHERE role IN ('owner','admin') AND user_id<>NEW.updated_by AND (NEW.status<>OLD.status OR NEW.incomplete_reason<>OLD.incomplete_reason);
END;
--> statement-breakpoint
CREATE TRIGGER notify_correction_requested AFTER INSERT ON attendance_corrections
WHEN NEW.status='pending' AND COALESCE((SELECT json_extract(value,'$.notifications') FROM settings WHERE key='features'),1)=1 AND COALESCE((SELECT json_extract(value,'$.attendance') FROM settings WHERE key='features'),1)=1
BEGIN
 INSERT OR IGNORE INTO notifications(id,event_key,user_id,kind,resource_id,title,body,created_at)
 SELECT lower(hex(randomblob(16))),'correction:'||NEW.id||':requested',user_id,'attendance_request',NEW.id,CASE WHEN NEW.kind='delete' THEN 'Žádost o smazání docházky' ELSE 'Žádost o opravu docházky' END,NEW.user_name,NEW.created_at FROM members WHERE role IN ('owner','admin') AND user_id<>NEW.created_by;
END;
--> statement-breakpoint
CREATE TRIGGER notify_correction_reviewed AFTER UPDATE OF status ON attendance_corrections
WHEN OLD.status='pending' AND NEW.status IN ('approved','rejected') AND COALESCE((SELECT json_extract(value,'$.notifications') FROM settings WHERE key='features'),1)=1 AND COALESCE((SELECT json_extract(value,'$.attendance') FROM settings WHERE key='features'),1)=1
BEGIN
 INSERT OR IGNORE INTO notifications(id,event_key,user_id,kind,resource_id,title,body,created_at)
 SELECT lower(hex(randomblob(16))),'correction:'||NEW.id||':reviewed',user_id,'attendance_review',NEW.id,CASE WHEN NEW.status='approved' THEN 'Docházka: žádost schválena' ELSE 'Docházka: žádost zamítnuta' END,CASE WHEN NEW.kind='delete' THEN 'Žádost o smazání záznamu byla vyřízena.' ELSE 'Žádost o opravu času byla vyřízena.' END,NEW.reviewed_at FROM members WHERE user_id=NEW.user_id AND user_id<>NEW.reviewed_by;
END;
