ALTER TABLE `service_tariffs` ADD `discipline` text;
--> statement-breakpoint
CREATE TRIGGER workspace_tariff_discipline_immutable BEFORE UPDATE OF discipline ON service_tariffs
WHEN EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only')) AND NEW.discipline IS NOT OLD.discipline
BEGIN SELECT RAISE(ABORT,'workspace_tariff_discipline_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_period_tariff_scope BEFORE INSERT ON subscription_periods
WHEN EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only')) AND NOT EXISTS(SELECT 1 FROM subscriptions s JOIN service_tariffs t ON t.id=NEW.tariff_id AND t.discipline=s.discipline WHERE s.id=NEW.subscription_id)
BEGIN SELECT RAISE(ABORT,'workspace_tariff_discipline_mismatch'); END;
--> statement-breakpoint
CREATE TRIGGER workspace_subscription_discipline_immutable BEFORE UPDATE OF discipline ON subscriptions
WHEN EXISTS(SELECT 1 FROM workspaces WHERE state IN ('active','read_only')) AND NEW.discipline IS NOT OLD.discipline
BEGIN SELECT RAISE(ABORT,'workspace_subscription_discipline_immutable'); END;
