CREATE TABLE `ai_audit_answers` (
	`id` text PRIMARY KEY NOT NULL,
	`audit_id` text NOT NULL,
	`assistant` text NOT NULL,
	`model` text NOT NULL,
	`web_search` integer DEFAULT 0 NOT NULL,
	`question_key` text NOT NULL,
	`prompt` text NOT NULL,
	`answer` text,
	`mentioned` integer DEFAULT 0 NOT NULL,
	`comparisons_json` text,
	`citations_json` text,
	`sources_json` text,
	`error` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `aiaa_audit` ON `ai_audit_answers` (`audit_id`);--> statement-breakpoint
CREATE TABLE `ai_audits` (
	`id` text PRIMARY KEY NOT NULL,
	`location_id` text NOT NULL,
	`status` text NOT NULL,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	`accuracy` real,
	`visibility` real,
	`facts_checked` integer DEFAULT 0 NOT NULL,
	`facts_wrong` integer DEFAULT 0 NOT NULL,
	`error_json` text
);
--> statement-breakpoint
CREATE INDEX `aia_loc` ON `ai_audits` (`location_id`,`started_at`);