ALTER TABLE `ai_audit_answers` ADD `confused_with` text;--> statement-breakpoint
ALTER TABLE `ai_audits` ADD `assistants_total` integer DEFAULT 1 NOT NULL;