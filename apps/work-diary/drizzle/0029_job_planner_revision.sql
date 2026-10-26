INSERT OR IGNORE INTO settings(key,value,version) VALUES('job-planner-revision','',0);
--> statement-breakpoint
CREATE TRIGGER job_planner_insert AFTER INSERT ON jobs BEGIN UPDATE settings SET version=version+1 WHERE key='job-planner-revision'; END;
--> statement-breakpoint
CREATE TRIGGER job_planner_update AFTER UPDATE ON jobs BEGIN UPDATE settings SET version=version+1 WHERE key='job-planner-revision'; END;
--> statement-breakpoint
CREATE TRIGGER job_planner_delete AFTER DELETE ON jobs BEGIN UPDATE settings SET version=version+1 WHERE key='job-planner-revision'; END;
