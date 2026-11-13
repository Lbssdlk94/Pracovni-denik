CREATE TRIGGER local_auth_freeze_local_credentials_insert BEFORE INSERT ON "local_credentials"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER local_auth_revision_local_credentials_insert AFTER INSERT ON "local_credentials"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;

--> statement-breakpoint
CREATE TRIGGER local_auth_freeze_local_credentials_update BEFORE UPDATE ON "local_credentials"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER local_auth_revision_local_credentials_update AFTER UPDATE ON "local_credentials"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;

--> statement-breakpoint
CREATE TRIGGER local_auth_freeze_local_credentials_delete BEFORE DELETE ON "local_credentials"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER local_auth_revision_local_credentials_delete AFTER DELETE ON "local_credentials"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;

--> statement-breakpoint
CREATE TRIGGER local_auth_freeze_local_auth_events_insert BEFORE INSERT ON "local_auth_events"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER local_auth_revision_local_auth_events_insert AFTER INSERT ON "local_auth_events"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;

--> statement-breakpoint
CREATE TRIGGER local_auth_freeze_local_auth_events_update BEFORE UPDATE ON "local_auth_events"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER local_auth_revision_local_auth_events_update AFTER UPDATE ON "local_auth_events"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;

--> statement-breakpoint
CREATE TRIGGER local_auth_freeze_local_auth_events_delete BEFORE DELETE ON "local_auth_events"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND freeze_id IS NOT NULL AND bypass=0)
BEGIN SELECT RAISE(ABORT,'workspace_transfer_frozen'); END;
--> statement-breakpoint
CREATE TRIGGER local_auth_revision_local_auth_events_delete AFTER DELETE ON "local_auth_events"
WHEN EXISTS(SELECT 1 FROM workspace_transfer_control WHERE singleton='primary' AND bypass=0)
BEGIN UPDATE workspace_transfer_control SET generation=generation+1 WHERE singleton='primary'; END;
