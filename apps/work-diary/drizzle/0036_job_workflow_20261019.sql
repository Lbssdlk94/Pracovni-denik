CREATE TABLE `job_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`garden_id` text,
	`reason` text NOT NULL,
	`ended_at` integer NOT NULL,
	`actor_id` text NOT NULL,
	`actor_name` text NOT NULL,
	`snapshot` text NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `job_attempts_job_idx` ON `job_attempts` (`job_id`,`ended_at`);--> statement-breakpoint
CREATE INDEX `job_attempts_garden_idx` ON `job_attempts` (`garden_id`,`ended_at`);--> statement-breakpoint
ALTER TABLE `service_reports` ADD `document_state` text DEFAULT 'draft' NOT NULL;
--> statement-breakpoint
-- Preserve the currently known unfinished attempt before any future reschedule.
INSERT OR IGNORE INTO job_attempts(id,job_id,garden_id,reason,ended_at,actor_id,actor_name,snapshot) SELECT 'attempt:'||j.id||':'||j.version,j.id,j.garden_id,j.incomplete_reason,j.updated_at,j.updated_by,COALESCE((SELECT name FROM members WHERE user_id=j.updated_by),j.updated_by),json_object('title',j.title,'gardenId',j.garden_id,'customerId',j.customer_id,'customerName',j.customer_name,'address',j.address,'city',j.city,'jobType',j.job_type,'dueDate',j.due_date,'startTime',j.start_time,'endTime',j.end_time,'plannedStart',j.planned_start,'estimatedMinutes',j.estimated_minutes,'assignedTo',j.assigned_to,'version',j.version,'assignedUsers',json(j.assigned_users),'assignedName',COALESCE((SELECT group_concat(name, ', ') FROM members WHERE user_id=j.assigned_to OR user_id IN (SELECT value FROM json_each(j.assigned_users))),j.assigned_name),'report',json(COALESCE((SELECT json_object('date',date,'work',work,'material',material,'defects',defects,'notes',notes,'recommendations',recommendations,'photoIds',json(photo_ids)) FROM service_reports WHERE job_id=j.id),'{}'))) FROM jobs j WHERE j.deleted=0 AND j.status='incomplete';
--> statement-breakpoint
CREATE TRIGGER job_incomplete_attempt_update AFTER UPDATE OF status,incomplete_reason ON jobs WHEN NEW.deleted=0 AND NEW.status='incomplete' AND (OLD.status<>'incomplete' OR NEW.incomplete_reason<>OLD.incomplete_reason) BEGIN INSERT OR IGNORE INTO job_attempts(id,job_id,garden_id,reason,ended_at,actor_id,actor_name,snapshot) VALUES('attempt:'||NEW.id||':'||NEW.version,NEW.id,OLD.garden_id,NEW.incomplete_reason,NEW.updated_at,NEW.updated_by,COALESCE((SELECT name FROM members WHERE user_id=NEW.updated_by),NEW.updated_by),json_object('title',OLD.title,'gardenId',OLD.garden_id,'customerId',OLD.customer_id,'customerName',OLD.customer_name,'address',OLD.address,'city',OLD.city,'jobType',OLD.job_type,'dueDate',OLD.due_date,'startTime',OLD.start_time,'endTime',OLD.end_time,'plannedStart',OLD.planned_start,'estimatedMinutes',OLD.estimated_minutes,'assignedTo',OLD.assigned_to,'version',OLD.version,'assignedUsers',json(OLD.assigned_users),'assignedName',COALESCE((SELECT group_concat(name, ', ') FROM members WHERE user_id=OLD.assigned_to OR user_id IN (SELECT value FROM json_each(OLD.assigned_users))),OLD.assigned_name),'report',json(COALESCE((SELECT json_object('date',date,'work',work,'material',material,'defects',defects,'notes',notes,'recommendations',recommendations,'photoIds',json(photo_ids)) FROM service_reports WHERE job_id=OLD.id),'{}')))); END;
--> statement-breakpoint
CREATE TRIGGER job_incomplete_attempt_insert AFTER INSERT ON jobs WHEN NEW.deleted=0 AND NEW.status='incomplete' BEGIN INSERT OR IGNORE INTO job_attempts(id,job_id,garden_id,reason,ended_at,actor_id,actor_name,snapshot) VALUES('attempt:'||NEW.id||':'||NEW.version,NEW.id,NEW.garden_id,NEW.incomplete_reason,NEW.updated_at,NEW.updated_by,COALESCE((SELECT name FROM members WHERE user_id=NEW.updated_by),NEW.updated_by),json_object('title',NEW.title,'gardenId',NEW.garden_id,'customerId',NEW.customer_id,'customerName',NEW.customer_name,'address',NEW.address,'city',NEW.city,'jobType',NEW.job_type,'dueDate',NEW.due_date,'startTime',NEW.start_time,'endTime',NEW.end_time,'plannedStart',NEW.planned_start,'estimatedMinutes',NEW.estimated_minutes,'assignedTo',NEW.assigned_to,'version',NEW.version,'assignedUsers',json(NEW.assigned_users),'assignedName',COALESCE((SELECT group_concat(name, ', ') FROM members WHERE user_id=NEW.assigned_to OR user_id IN (SELECT value FROM json_each(NEW.assigned_users))),NEW.assigned_name),'report',json(COALESCE((SELECT json_object('date',date,'work',work,'material',material,'defects',defects,'notes',notes,'recommendations',recommendations,'photoIds',json(photo_ids)) FROM service_reports WHERE job_id=NEW.id),'{}')))); END;
--> statement-breakpoint
-- Only an actual saved completion of this report version establishes a historical ready state.
UPDATE service_reports SET document_state='ready' WHERE (trim(work||material||defects||notes||recommendations)<>'' OR photo_ids<>'[]' OR material_items<>'[]') AND EXISTS(SELECT 1 FROM service_report_history h WHERE h.job_id=service_reports.job_id AND h.created_at=service_reports.updated_at AND h.created_by=service_reports.updated_by AND json_extract(h.record,'$.complete')=1);

--> statement-breakpoint
CREATE TRIGGER job_replanned_protocol_draft AFTER UPDATE OF status ON jobs WHEN OLD.status='incomplete' AND NEW.status='planned' BEGIN UPDATE service_reports SET document_state='draft' WHERE job_id=NEW.id; END;
