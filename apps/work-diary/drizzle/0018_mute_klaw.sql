CREATE TABLE `service_email_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`notification_id` text NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer DEFAULT 0 NOT NULL,
	`lease_token` text,
	`lease_until` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`notification_id`) REFERENCES `notifications`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `service_report_history` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`record` text NOT NULL,
	`created_at` integer NOT NULL,
	`created_by` text NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `service_reports` (
	`job_id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`work` text NOT NULL,
	`material` text NOT NULL,
	`defects` text NOT NULL,
	`notes` text NOT NULL,
	`recommendations` text NOT NULL,
	`photo_ids` text DEFAULT '[]' NOT NULL,
	`version` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `service_tariffs` (
	`id` text PRIMARY KEY NOT NULL,
	`definition` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`updated_by` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `subscription_operations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`entity_id` text NOT NULL,
	`hash` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `subscription_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`period_id` text NOT NULL,
	`date` text NOT NULL,
	`amount` integer NOT NULL,
	`note` text NOT NULL,
	`created_at` integer NOT NULL,
	`created_by` text NOT NULL,
	FOREIGN KEY (`period_id`) REFERENCES `subscription_periods`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `subscription_periods` (
	`carry_from_id` text,
	`id` text PRIMARY KEY NOT NULL,
	`subscription_id` text NOT NULL,
	`tariff_id` text NOT NULL,
	`snapshot` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`agreed_price` integer NOT NULL,
	`initial_usage` text DEFAULT '{}' NOT NULL,
	`payment_status` text DEFAULT 'unpaid' NOT NULL,
	`due_date` text NOT NULL,
	`settlement` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tariff_id`) REFERENCES `service_tariffs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `subscription_periods_sub_idx` ON `subscription_periods` (`subscription_id`,`start_date`);--> statement-breakpoint
CREATE TABLE `subscription_usage` (
	`job_id` text PRIMARY KEY NOT NULL,
	`period_id` text NOT NULL,
	`service_id` text NOT NULL,
	`units` integer DEFAULT 1 NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`period_id`) REFERENCES `subscription_periods`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `subscription_usage_period_idx` ON `subscription_usage` (`period_id`,`service_id`,`active`);--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`garden_id` text,
	`status` text DEFAULT 'active' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`last_operation` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`garden_id`) REFERENCES `gardens`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `subscriptions_customer_idx` ON `subscriptions` (`customer_id`);--> statement-breakpoint
ALTER TABLE `jobs` ADD `service_deduct` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `jobs` ADD `service_period_id` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `service_item_id` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `service_unit` integer;--> statement-breakpoint
ALTER TABLE `jobs` ADD `service_approval` text DEFAULT 'confirmed' NOT NULL;--> statement-breakpoint
ALTER TABLE `jobs` ADD `material_status` text DEFAULT 'unchecked' NOT NULL;--> statement-breakpoint
ALTER TABLE `jobs` ADD `material_note` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `jobs` ADD `service_operation` text;--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_service_occurrence_idx` ON `jobs` (`service_period_id`,`service_item_id`,`service_unit`);
--> statement-breakpoint
INSERT OR IGNORE INTO service_tariffs(id,definition,active,version,created_at,updated_at,updated_by) VALUES('tariff-low','{"code":"LOW","name":"Základní péče","priceMinor":299000,"currency":"CZK","billingPeriod":"yearly","description":"LOW – Základní péče","priority":false,"autoConfirm":false,"partsIncluded":false,"extraRepairsIncluded":false,"visitLimit":"","terms":"Náhradní díly a mimořádné opravy nejsou zahrnuty v ceně.","benefits":["Základní kontrola systému","Kontrola a seřízení postřikovačů","Evidence servisní historie"],"services":[{"id":"service","kind":"service","name":"Servis závlahy","description":"Kontrola systému a seřízení postřikovačů.","count":1,"frequency":"yearly","months":[],"autoPlan":true,"deduct":true,"included":true,"limit":""},{"id":"blowout","kind":"blowout","name":"Podzimní vyfouknutí závlahy","description":"Zazimování systému.","count":1,"frequency":"custom","months":[10,11],"autoPlan":true,"deduct":true,"included":true,"limit":""}]}',1,1,0,0,'system');

--> statement-breakpoint
INSERT OR IGNORE INTO service_tariffs(id,definition,active,version,created_at,updated_at,updated_by) VALUES('tariff-medium','{"code":"MEDIUM","name":"Pravidelná péče","priceMinor":599000,"currency":"CZK","billingPeriod":"yearly","description":"MEDIUM – Pravidelná péče","priority":true,"autoConfirm":false,"partsIncluded":false,"extraRepairsIncluded":false,"visitLimit":"","terms":"Náhradní díly a mimořádné opravy nejsou zahrnuty v ceně.","benefits":["Jarní spuštění systému","Kontrola trysek, ventilů a tlaku","Sezonní nastavení zavlažování","Přednostní termíny servisu","Evidence servisní historie"],"services":[{"id":"service","kind":"service","name":"Servis závlahy","description":"Kontrola systému a seřízení postřikovačů.","count":3,"frequency":"yearly","months":[],"autoPlan":true,"deduct":true,"included":true,"limit":""},{"id":"blowout","kind":"blowout","name":"Podzimní vyfouknutí závlahy","description":"Zazimování systému.","count":1,"frequency":"custom","months":[10,11],"autoPlan":true,"deduct":true,"included":true,"limit":""},{"id":"spring","kind":"spring","name":"Jarní spuštění systému","description":"Jarní kontrola a spuštění. Termín připraví správce podle potřeby.","count":1,"frequency":"custom","months":[3,4,5],"autoPlan":false,"deduct":true,"included":true,"limit":""}]}',1,1,0,0,'system');

--> statement-breakpoint
INSERT OR IGNORE INTO service_tariffs(id,definition,active,version,created_at,updated_at,updated_by) VALUES('tariff-high','{"code":"HIGH","name":"Kompletní péče","priceMinor":1499000,"currency":"CZK","billingPeriod":"yearly","description":"HIGH – Kompletní péče","priority":true,"autoConfirm":false,"partsIncluded":false,"extraRepairsIncluded":false,"visitLimit":"","terms":"Náhradní díly a mimořádné opravy nejsou zahrnuty v ceně.","benefits":["Jarní spuštění systému","Pravidelná kontrola závlahy","Optimalizace zavlažovacích programů","Kontrola funkčnosti jednotlivých sekcí","Přednostní řešení poruch","Kompletní servisní historie a fotodokumentace"],"services":[{"id":"service","kind":"service","name":"Servis závlahy","description":"Kontrola systému a seřízení postřikovačů.","count":12,"frequency":"monthly","months":[],"autoPlan":true,"deduct":true,"included":true,"limit":""},{"id":"blowout","kind":"blowout","name":"Podzimní vyfouknutí závlahy","description":"Zazimování systému.","count":1,"frequency":"custom","months":[10,11],"autoPlan":true,"deduct":true,"included":true,"limit":""},{"id":"spring","kind":"spring","name":"Jarní spuštění systému","description":"Jarní kontrola a spuštění. Termín připraví správce podle potřeby.","count":1,"frequency":"custom","months":[3,4,5],"autoPlan":false,"deduct":true,"included":true,"limit":""}]}',1,1,0,0,'system');

--> statement-breakpoint
DROP TRIGGER notify_job_created;
--> statement-breakpoint
CREATE TRIGGER notify_job_created AFTER INSERT ON jobs
WHEN NEW.deleted=0 AND NEW.service_approval='confirmed' AND COALESCE((SELECT json_extract(value,'$.notifications') FROM settings WHERE key='features'),1)=1 AND COALESCE((SELECT json_extract(value,'$.jobs') FROM settings WHERE key='features'),1)=1
BEGIN
 INSERT OR IGNORE INTO notifications(id,event_key,user_id,kind,resource_id,title,body,created_at)
 SELECT lower(hex(randomblob(16))),'job:'||NEW.id||':'||NEW.version||':assigned',user_id,'job_assigned',NEW.id,'Nová zakázka',NEW.title,NEW.updated_at FROM members WHERE user_id=NEW.assigned_to AND user_id<>NEW.updated_by;
END;

--> statement-breakpoint
DROP TRIGGER notify_job_changed;
--> statement-breakpoint
CREATE TRIGGER notify_job_changed AFTER UPDATE ON jobs
WHEN NEW.deleted=0 AND NEW.service_approval='confirmed' AND COALESCE((SELECT json_extract(value,'$.notifications') FROM settings WHERE key='features'),1)=1 AND COALESCE((SELECT json_extract(value,'$.jobs') FROM settings WHERE key='features'),1)=1
BEGIN
 INSERT OR IGNORE INTO notifications(id,event_key,user_id,kind,resource_id,title,body,created_at)
 SELECT lower(hex(randomblob(16))),'job:'||NEW.id||':'||NEW.version||':assigned',user_id,'job_assigned',NEW.id,CASE WHEN NEW.assigned_to<>OLD.assigned_to THEN 'Přiřazená zakázka' ELSE 'Změna zakázky' END,NEW.title,NEW.updated_at FROM members
 WHERE user_id=NEW.assigned_to AND user_id<>NEW.updated_by AND (NEW.service_approval<>OLD.service_approval OR NEW.assigned_to<>OLD.assigned_to OR NEW.title<>OLD.title OR NEW.description<>OLD.description OR NEW.address<>OLD.address OR NEW.garden_id IS NOT OLD.garden_id OR NEW.due_date<>OLD.due_date OR NEW.customer_name<>OLD.customer_name OR NEW.city<>OLD.city OR NEW.status<>OLD.status OR NEW.incomplete_reason<>OLD.incomplete_reason);
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
 SELECT lower(hex(randomblob(16))),'job:'||NEW.id||':'||NEW.version||':assigned',user_id,'job_assigned',NEW.id,'Změna termínu zakázky',NEW.title,NEW.updated_at FROM members WHERE user_id=NEW.assigned_to AND user_id<>NEW.updated_by;
END;

--> statement-breakpoint
CREATE TRIGGER subscription_usage_changed AFTER UPDATE ON jobs
WHEN NEW.service_period_id IS NOT NULL
BEGIN
 INSERT INTO subscription_usage(job_id,period_id,service_id,units,active,updated_at)
 VALUES(NEW.id,NEW.service_period_id,NEW.service_item_id,NEW.service_deduct,CASE WHEN NEW.status='done' AND NEW.deleted=0 THEN 1 ELSE 0 END,NEW.updated_at)
 ON CONFLICT(job_id) DO UPDATE SET units=excluded.units,active=excluded.active,updated_at=excluded.updated_at;
END;
--> statement-breakpoint
CREATE TRIGGER subscription_work_guard BEFORE UPDATE ON jobs
WHEN NEW.service_period_id IS NOT NULL AND NEW.status='done' AND NEW.deleted=0 AND (OLD.status<>'done' OR (OLD.service_deduct=0 AND NEW.service_deduct=1) OR OLD.deleted=1)
BEGIN
 SELECT RAISE(ABORT,'service_report_required') WHERE NOT EXISTS(SELECT 1 FROM service_reports WHERE job_id=NEW.id);
 SELECT RAISE(ABORT,'service_not_approved') WHERE NEW.service_approval<>'confirmed';
 SELECT RAISE(ABORT,'subscription_quota_exceeded') WHERE NEW.service_deduct=1 AND (
  WITH RECURSIVE lineage(id) AS (SELECT NEW.service_period_id UNION ALL SELECT p.carry_from_id FROM subscription_periods p JOIN lineage l ON p.id=l.id WHERE p.carry_from_id IS NOT NULL)
  SELECT COALESCE((SELECT SUM(units) FROM subscription_usage WHERE period_id IN (SELECT id FROM lineage) AND service_id=NEW.service_item_id AND active=1 AND job_id<>NEW.id),0)+COALESCE((SELECT SUM(COALESCE(json_extract(p.initial_usage,'$.'||NEW.service_item_id),0)) FROM subscription_periods p JOIN lineage l ON l.id=p.id),0)
 ) >= (SELECT json_extract(item.value,'$.count') FROM subscription_periods p,json_each(p.snapshot,'$.services') item WHERE p.id=NEW.service_period_id AND json_extract(item.value,'$.id')=NEW.service_item_id);
END;
