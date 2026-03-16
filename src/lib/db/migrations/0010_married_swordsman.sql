DROP POLICY "equipment_readings_select_policy" ON "equipment_readings" CASCADE;--> statement-breakpoint
DROP POLICY "equipment_readings_insert_policy" ON "equipment_readings" CASCADE;--> statement-breakpoint
DROP POLICY "equipment_readings_update_policy" ON "equipment_readings" CASCADE;--> statement-breakpoint
DROP POLICY "equipment_readings_delete_policy" ON "equipment_readings" CASCADE;--> statement-breakpoint
DROP TABLE "equipment_readings" CASCADE;--> statement-breakpoint
DROP POLICY "user_notifications_select_policy" ON "user_notifications" CASCADE;--> statement-breakpoint
DROP POLICY "user_notifications_update_policy" ON "user_notifications" CASCADE;--> statement-breakpoint
DROP TABLE "user_notifications" CASCADE;--> statement-breakpoint
DROP POLICY "push_subscriptions_select_policy" ON "push_subscriptions" CASCADE;--> statement-breakpoint
DROP POLICY "push_subscriptions_insert_policy" ON "push_subscriptions" CASCADE;--> statement-breakpoint
DROP POLICY "push_subscriptions_delete_policy" ON "push_subscriptions" CASCADE;--> statement-breakpoint
DROP TABLE "push_subscriptions" CASCADE;--> statement-breakpoint
DROP POLICY "notification_prefs_select_policy" ON "notification_preferences" CASCADE;--> statement-breakpoint
DROP POLICY "notification_prefs_insert_policy" ON "notification_preferences" CASCADE;--> statement-breakpoint
DROP POLICY "notification_prefs_update_policy" ON "notification_preferences" CASCADE;--> statement-breakpoint
DROP POLICY "notification_prefs_delete_policy" ON "notification_preferences" CASCADE;--> statement-breakpoint
DROP TABLE "notification_preferences" CASCADE;--> statement-breakpoint
ALTER TABLE "checklist_tasks" DROP CONSTRAINT "checklist_tasks_suppresses_task_id_checklist_tasks_id_fk";
--> statement-breakpoint
ALTER TABLE "schedule_rules" DROP CONSTRAINT "schedule_rules_checklist_template_id_checklist_templates_id_fk";
--> statement-breakpoint
ALTER TABLE "orgs" DROP COLUMN "logo_url";--> statement-breakpoint
ALTER TABLE "checklist_tasks" DROP COLUMN "requires_photo";--> statement-breakpoint
ALTER TABLE "checklist_tasks" DROP COLUMN "suppresses_task_id";--> statement-breakpoint
ALTER TABLE "checklist_templates" DROP COLUMN "is_default";--> statement-breakpoint
ALTER TABLE "schedule_rules" DROP COLUMN "checklist_template_id";--> statement-breakpoint
ALTER TABLE "work_orders" DROP COLUMN "labor_hours";--> statement-breakpoint
ALTER TABLE "work_orders" DROP COLUMN "labor_rate";--> statement-breakpoint
ALTER TABLE "work_orders" DROP COLUMN "labor_actual_hours";