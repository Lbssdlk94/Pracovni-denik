-- Existing interval ledger gains attendance-only breaks/explicit other activities.
-- No new ledger; all existing rows, IDs, versions and guards are preserved.
DROP TRIGGER job_time_no_overlap_insert;
--> statement-breakpoint
DROP TRIGGER job_time_no_overlap_update;
--> statement-breakpoint
DROP TRIGGER job_time_shift_insert;
--> statement-breakpoint
DROP TRIGGER job_time_shift_update;
--> statement-breakpoint
DROP TRIGGER job_time_attendance_protect;
--> statement-breakpoint
DROP TRIGGER job_time_attendance_close;
--> statement-breakpoint
DROP TRIGGER job_time_review_requested;
--> statement-breakpoint
DROP TRIGGER job_time_review_decided;
--> statement-breakpoint
DROP TRIGGER job_time_attendance_review_author;
--> statement-breakpoint
CREATE TABLE `job_time_intervals_new` (
	`arrival_date` text,
	`arrival_time` text,
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text,
	`user_id` text NOT NULL,
	`user_name` text NOT NULL,
	`kind` text NOT NULL,
	`start_at` integer NOT NULL,
	`end_at` integer,
	`shift_id` text NOT NULL,
	`hourly_minor` integer,
	`version` integer DEFAULT 1 NOT NULL,
	`approval` text DEFAULT 'pending' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`shift_id`) REFERENCES `attendance_shifts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT job_time_job_required CHECK(job_id IS NOT NULL OR kind IN ('break','other')),
	CONSTRAINT "job_time_kind" CHECK("job_time_intervals_new"."kind" IN ('work','travel','break','other')),
	CONSTRAINT "job_time_approval" CHECK("job_time_intervals_new"."approval" IN ('pending','approved')),
	CONSTRAINT "job_time_duration" CHECK("job_time_intervals_new"."end_at" IS NULL OR "job_time_intervals_new"."end_at">"job_time_intervals_new"."start_at"),
	CONSTRAINT "job_time_cost" CHECK("job_time_intervals_new"."hourly_minor" IS NULL OR "job_time_intervals_new"."hourly_minor">=0)
);
--> statement-breakpoint
INSERT INTO job_time_intervals_new(arrival_date,arrival_time,id,job_id,user_id,user_name,kind,start_at,end_at,shift_id,hourly_minor,version,approval,created_by,created_at,updated_by,updated_at) SELECT arrival_date,arrival_time,id,job_id,user_id,user_name,kind,start_at,end_at,shift_id,hourly_minor,version,approval,created_by,created_at,updated_by,updated_at FROM job_time_intervals;
--> statement-breakpoint
DROP TABLE job_time_intervals;
--> statement-breakpoint
ALTER TABLE job_time_intervals_new RENAME TO job_time_intervals;
--> statement-breakpoint
CREATE UNIQUE INDEX job_time_one_active ON job_time_intervals(user_id) WHERE end_at IS NULL;
--> statement-breakpoint
CREATE INDEX job_time_job_start ON job_time_intervals(job_id,start_at);
--> statement-breakpoint
CREATE INDEX job_time_shift ON job_time_intervals(shift_id);
--> statement-breakpoint
CREATE INDEX job_time_user_start ON job_time_intervals(user_id,start_at);
--> statement-breakpoint
CREATE TRIGGER job_time_no_overlap_insert BEFORE INSERT ON job_time_intervals
WHEN EXISTS(SELECT 1 FROM job_time_intervals x WHERE x.user_id=NEW.user_id AND (x.end_at IS NULL OR x.end_at>NEW.start_at) AND (NEW.end_at IS NULL OR x.start_at<NEW.end_at))
BEGIN SELECT RAISE(ABORT,'job_time_overlap'); END;
--> statement-breakpoint
CREATE TRIGGER job_time_no_overlap_update BEFORE UPDATE OF start_at,end_at,user_id ON job_time_intervals
WHEN EXISTS(SELECT 1 FROM job_time_intervals x WHERE x.user_id=NEW.user_id AND x.id<>NEW.id AND (x.end_at IS NULL OR x.end_at>NEW.start_at) AND (NEW.end_at IS NULL OR x.start_at<NEW.end_at))
BEGIN SELECT RAISE(ABORT,'job_time_overlap'); END;
--> statement-breakpoint
CREATE TRIGGER job_time_shift_insert BEFORE INSERT ON job_time_intervals
WHEN NOT EXISTS(SELECT 1 FROM attendance_shifts s WHERE s.id=NEW.shift_id AND s.user_id=NEW.user_id AND s.deleted_at IS NULL AND s.start_at<=NEW.start_at AND (s.end_at IS NULL OR NEW.end_at IS NOT NULL AND NEW.end_at<=s.end_at))
BEGIN SELECT RAISE(ABORT,'job_time_outside_attendance'); END;
--> statement-breakpoint
CREATE TRIGGER job_time_shift_update BEFORE UPDATE OF start_at,end_at,shift_id ON job_time_intervals
WHEN NOT EXISTS(SELECT 1 FROM attendance_shifts s WHERE s.id=NEW.shift_id AND s.user_id=NEW.user_id AND s.deleted_at IS NULL AND s.start_at<=NEW.start_at AND (s.end_at IS NULL OR NEW.end_at IS NOT NULL AND NEW.end_at<=s.end_at))
BEGIN SELECT RAISE(ABORT,'job_time_outside_attendance'); END;
--> statement-breakpoint
CREATE TRIGGER job_time_attendance_protect BEFORE UPDATE OF start_at,end_at,deleted_at ON attendance_shifts
WHEN EXISTS(SELECT 1 FROM job_time_intervals i WHERE i.shift_id=OLD.id AND (NEW.deleted_at IS NOT NULL OR i.start_at<NEW.start_at OR NEW.end_at IS NOT NULL AND (i.start_at>=NEW.end_at OR i.end_at>NEW.end_at)))
BEGIN SELECT RAISE(ABORT,'job_time_attendance_has_allocations'); END;
--> statement-breakpoint
CREATE TRIGGER job_time_attendance_close AFTER UPDATE OF end_at ON attendance_shifts
WHEN OLD.end_at IS NULL AND NEW.end_at IS NOT NULL
BEGIN
 INSERT INTO job_time_events(id,job_id,interval_id,actor_id,at,operation_id,before_value,after_value,reason)
 SELECT lower(hex(randomblob(16))),COALESCE(i.job_id,''),i.id,NEW.user_id,NEW.updated_at,COALESCE(NEW.end_mutation_id,NEW.last_correction_id,'attendance'),json_object('startAt',i.start_at,'endAt',i.end_at,'kind',i.kind,'version',i.version),json_object('startAt',i.start_at,'endAt',NEW.end_at,'kind',i.kind,'version',i.version+1),'Ukončení směny' FROM job_time_intervals i WHERE i.shift_id=NEW.id AND i.end_at IS NULL;
 UPDATE job_time_states SET version=version+1 WHERE user_id IN(SELECT user_id FROM job_time_intervals WHERE shift_id=NEW.id AND end_at IS NULL);
 UPDATE job_time_intervals SET end_at=NEW.end_at,version=version+1,updated_by=NEW.user_id,updated_at=NEW.updated_at WHERE shift_id=NEW.id AND end_at IS NULL;
END;
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
--> statement-breakpoint
CREATE TRIGGER job_time_attendance_review_author AFTER UPDATE OF status ON attendance_corrections
WHEN OLD.status='pending' AND NEW.status='approved'
BEGIN
 UPDATE job_time_events SET actor_id=NEW.reviewed_by,at=NEW.reviewed_at WHERE operation_id=NEW.id AND reason='Ukončení směny';
 UPDATE job_time_intervals SET updated_by=NEW.reviewed_by,updated_at=NEW.reviewed_at WHERE id IN(SELECT interval_id FROM job_time_events WHERE operation_id=NEW.id AND reason='Ukončení směny');
END;
