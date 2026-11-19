CREATE TABLE job_time_states (
 user_id TEXT PRIMARY KEY NOT NULL,
 version INTEGER NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE job_time_intervals (
 id TEXT PRIMARY KEY NOT NULL, job_id TEXT NOT NULL REFERENCES jobs(id),
 user_id TEXT NOT NULL, user_name TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('work','travel','break','other')),
 start_at INTEGER NOT NULL, end_at INTEGER, arrival_date TEXT, arrival_time TEXT,
 shift_id TEXT NOT NULL REFERENCES attendance_shifts(id),
 hourly_minor INTEGER, version INTEGER NOT NULL DEFAULT 1,
 approval TEXT NOT NULL DEFAULT 'pending' CHECK(approval IN ('pending','approved')),
 created_by TEXT NOT NULL, created_at INTEGER NOT NULL,
 updated_by TEXT NOT NULL, updated_at INTEGER NOT NULL,
 CHECK(end_at IS NULL OR end_at>start_at), CHECK(hourly_minor IS NULL OR hourly_minor>=0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX job_time_one_active ON job_time_intervals(user_id) WHERE end_at IS NULL;
--> statement-breakpoint
CREATE INDEX job_time_job_start ON job_time_intervals(job_id,start_at);
--> statement-breakpoint
CREATE INDEX job_time_shift ON job_time_intervals(shift_id);
--> statement-breakpoint
CREATE TABLE job_time_operations (
 id TEXT PRIMARY KEY NOT NULL, job_id TEXT NOT NULL, actor_id TEXT NOT NULL,
 hash TEXT NOT NULL, action TEXT NOT NULL, payload TEXT NOT NULL,
 created_at INTEGER NOT NULL, valid INTEGER NOT NULL CHECK(valid=1)
);
--> statement-breakpoint
CREATE TABLE job_time_events (
 id TEXT PRIMARY KEY NOT NULL, job_id TEXT NOT NULL, interval_id TEXT,
 actor_id TEXT NOT NULL, at INTEGER NOT NULL, operation_id TEXT NOT NULL,
 before_value TEXT, after_value TEXT, reason TEXT NOT NULL DEFAULT ''
);
--> statement-breakpoint
CREATE INDEX job_time_events_job ON job_time_events(job_id,at);
--> statement-breakpoint
CREATE TABLE job_time_reviews (
 id TEXT PRIMARY KEY NOT NULL, job_id TEXT NOT NULL, interval_id TEXT NOT NULL,
 user_id TEXT NOT NULL, base_version INTEGER NOT NULL,
 old_value TEXT, proposed TEXT NOT NULL, reason TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 created_by TEXT NOT NULL, created_at INTEGER NOT NULL,
 reviewed_by TEXT, reviewed_at INTEGER, review_note TEXT NOT NULL DEFAULT ''
);
--> statement-breakpoint
CREATE UNIQUE INDEX job_time_one_pending_review ON job_time_reviews(interval_id) WHERE status='pending';
--> statement-breakpoint
CREATE TABLE job_time_rates (
 user_id TEXT PRIMARY KEY NOT NULL, work_minor INTEGER, travel_minor INTEGER,
 version INTEGER NOT NULL DEFAULT 1, updated_by TEXT NOT NULL, updated_at INTEGER NOT NULL,
 CHECK(work_minor IS NULL OR work_minor BETWEEN 0 AND 100000000),
 CHECK(travel_minor IS NULL OR travel_minor BETWEEN 0 AND 100000000)
);
--> statement-breakpoint
CREATE TABLE job_time_leads (
 job_id TEXT PRIMARY KEY NOT NULL REFERENCES jobs(id), user_id TEXT NOT NULL,
 version INTEGER NOT NULL DEFAULT 1
);
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
 SELECT lower(hex(randomblob(16))),i.job_id,i.id,NEW.user_id,NEW.end_at,COALESCE(NEW.end_mutation_id,NEW.last_correction_id,'attendance'),json_object('startAt',i.start_at,'endAt',i.end_at,'kind',i.kind,'version',i.version),json_object('startAt',i.start_at,'endAt',NEW.end_at,'kind',i.kind,'version',i.version+1),'Ukončení směny' FROM job_time_intervals i WHERE i.shift_id=NEW.id AND i.end_at IS NULL;
 UPDATE job_time_states SET version=version+1 WHERE user_id IN(SELECT user_id FROM job_time_intervals WHERE shift_id=NEW.id AND end_at IS NULL);
 UPDATE job_time_intervals SET end_at=NEW.end_at,version=version+1,updated_by=NEW.user_id,updated_at=NEW.end_at WHERE shift_id=NEW.id AND end_at IS NULL;
END;
