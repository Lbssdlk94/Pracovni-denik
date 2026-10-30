CREATE TRIGGER workspace_capacity_invite_insert AFTER INSERT ON invitations
WHEN EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only')) AND (1=1) AND EXISTS(
 SELECT 1 FROM workspace_organizations o JOIN workspace_organization_policies p ON p.organization_id=o.id WHERE (NEW.role IN ('administrator','admin') OR EXISTS(SELECT 1 FROM json_each(NEW.disciplines) d WHERE d.value=o.discipline)) AND ((SELECT count(*) FROM members m WHERE m.role IN ('owner','administrator','admin') OR EXISTS(SELECT 1 FROM member_disciplines md WHERE md.user_id=m.user_id AND md.discipline=o.discipline)) + (SELECT count(*) FROM invitations i WHERE NOT EXISTS(SELECT 1 FROM members m WHERE m.email=i.email) AND (i.role IN ('administrator','admin') OR EXISTS(SELECT 1 FROM json_each(i.disciplines) d WHERE d.value=o.discipline))))>p.max_users
) BEGIN SELECT RAISE(ABORT,'workspace_member_capacity'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_capacity_invite_update AFTER UPDATE OF disciplines,role ON invitations
WHEN EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only')) AND (NEW.disciplines<>OLD.disciplines OR NEW.role<>OLD.role) AND EXISTS(
 SELECT 1 FROM workspace_organizations o JOIN workspace_organization_policies p ON p.organization_id=o.id WHERE (NEW.role IN ('administrator','admin') OR EXISTS(SELECT 1 FROM json_each(NEW.disciplines) d WHERE d.value=o.discipline)) AND ((SELECT count(*) FROM members m WHERE m.role IN ('owner','administrator','admin') OR EXISTS(SELECT 1 FROM member_disciplines md WHERE md.user_id=m.user_id AND md.discipline=o.discipline)) + (SELECT count(*) FROM invitations i WHERE NOT EXISTS(SELECT 1 FROM members m WHERE m.email=i.email) AND (i.role IN ('administrator','admin') OR EXISTS(SELECT 1 FROM json_each(i.disciplines) d WHERE d.value=o.discipline))))>p.max_users
) BEGIN SELECT RAISE(ABORT,'workspace_member_capacity'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_capacity_scope_insert AFTER INSERT ON member_disciplines
WHEN EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only')) AND (1=1) AND EXISTS(
 SELECT 1 FROM workspace_organizations o JOIN workspace_organization_policies p ON p.organization_id=o.id WHERE o.discipline=NEW.discipline AND EXISTS(SELECT 1 FROM members m WHERE m.user_id=NEW.user_id AND m.role NOT IN ('owner','administrator','admin')) AND ((SELECT count(*) FROM members m WHERE m.role IN ('owner','administrator','admin') OR EXISTS(SELECT 1 FROM member_disciplines md WHERE md.user_id=m.user_id AND md.discipline=o.discipline)) + (SELECT count(*) FROM invitations i WHERE NOT EXISTS(SELECT 1 FROM members m WHERE m.email=i.email) AND (i.role IN ('administrator','admin') OR EXISTS(SELECT 1 FROM json_each(i.disciplines) d WHERE d.value=o.discipline))))>p.max_users
) BEGIN SELECT RAISE(ABORT,'workspace_member_capacity'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_capacity_manager_insert AFTER INSERT ON members
WHEN EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only')) AND (NEW.role IN ('owner','administrator','admin')) AND EXISTS(
 SELECT 1 FROM workspace_organizations o JOIN workspace_organization_policies p ON p.organization_id=o.id WHERE ((SELECT count(*) FROM members m WHERE m.role IN ('owner','administrator','admin') OR EXISTS(SELECT 1 FROM member_disciplines md WHERE md.user_id=m.user_id AND md.discipline=o.discipline)) + (SELECT count(*) FROM invitations i WHERE NOT EXISTS(SELECT 1 FROM members m WHERE m.email=i.email) AND (i.role IN ('administrator','admin') OR EXISTS(SELECT 1 FROM json_each(i.disciplines) d WHERE d.value=o.discipline))))>p.max_users
) BEGIN SELECT RAISE(ABORT,'workspace_member_capacity'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_capacity_manager_update AFTER UPDATE OF role ON members
WHEN EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only')) AND (NEW.role IN ('owner','administrator','admin') AND OLD.role NOT IN ('owner','administrator','admin')) AND EXISTS(
 SELECT 1 FROM workspace_organizations o JOIN workspace_organization_policies p ON p.organization_id=o.id WHERE NOT EXISTS(SELECT 1 FROM member_disciplines md WHERE md.user_id=NEW.user_id AND md.discipline=o.discipline) AND ((SELECT count(*) FROM members m WHERE m.role IN ('owner','administrator','admin') OR EXISTS(SELECT 1 FROM member_disciplines md WHERE md.user_id=m.user_id AND md.discipline=o.discipline)) + (SELECT count(*) FROM invitations i WHERE NOT EXISTS(SELECT 1 FROM members m WHERE m.email=i.email) AND (i.role IN ('administrator','admin') OR EXISTS(SELECT 1 FROM json_each(i.disciplines) d WHERE d.value=o.discipline))))>p.max_users
) BEGIN SELECT RAISE(ABORT,'workspace_member_capacity'); END;
--> statement-breakpoint
