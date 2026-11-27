-- A withdrawn request is not an approval and must not keep the one-pending lock.
CREATE TABLE `job_time_reviews_new` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`interval_id` text NOT NULL,
	`user_id` text NOT NULL,
	`base_version` integer NOT NULL,
	`old_value` text,
	`proposed` text NOT NULL,
	`reason` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`reviewed_by` text,
	`reviewed_at` integer,
	`review_note` text DEFAULT '' NOT NULL,
	CONSTRAINT "job_time_review_status" CHECK("status" IN ('pending','approved','rejected','withdrawn'))
);
--> statement-breakpoint
INSERT INTO `job_time_reviews_new`(`id`,`job_id`,`interval_id`,`user_id`,`base_version`,`old_value`,`proposed`,`reason`,`status`,`created_by`,`created_at`,`reviewed_by`,`reviewed_at`,`review_note`) SELECT `id`,`job_id`,`interval_id`,`user_id`,`base_version`,`old_value`,`proposed`,`reason`,`status`,`created_by`,`created_at`,`reviewed_by`,`reviewed_at`,`review_note` FROM `job_time_reviews`;
--> statement-breakpoint
DROP TABLE `job_time_reviews`;
--> statement-breakpoint
ALTER TABLE `job_time_reviews_new` RENAME TO `job_time_reviews`;
--> statement-breakpoint
CREATE UNIQUE INDEX `job_time_one_pending_review` ON `job_time_reviews` (`interval_id`) WHERE "job_time_reviews"."status"='pending';
--> statement-breakpoint
CREATE TRIGGER job_time_review_requested AFTER INSERT ON job_time_reviews
WHEN NEW.status='pending'
BEGIN
 INSERT OR IGNORE INTO notifications(id,event_key,user_id,kind,resource_id,title,body,created_at)
 SELECT lower(hex(randomblob(16))),'time-review:'||NEW.id||':requested',m.user_id,'job_time_request',NEW.job_id,'Pracovní doba: žádost ke schválení','Zkontrolujte návrh v pracovní době zakázky.',NEW.created_at FROM members m
 WHERE m.role IN ('owner','administrator','admin') AND m.user_id<>NEW.created_by;
END;
--> statement-breakpoint
CREATE TRIGGER job_time_review_decided AFTER UPDATE OF status ON job_time_reviews
WHEN OLD.status='pending' AND NEW.status IN ('approved','rejected')
BEGIN
 INSERT OR IGNORE INTO notifications(id,event_key,user_id,kind,resource_id,title,body,created_at)
 SELECT lower(hex(randomblob(16))),'time-review:'||NEW.id||':reviewed',m.user_id,'job_time_review',NEW.job_id,CASE NEW.status WHEN 'approved' THEN 'Pracovní doba: schváleno' ELSE 'Pracovní doba: zamítnuto' END,'Vyřízení návrhu najdete v pracovní době zakázky.',NEW.reviewed_at FROM members m
 WHERE m.user_id=NEW.user_id AND m.user_id<>NEW.reviewed_by;
END;

