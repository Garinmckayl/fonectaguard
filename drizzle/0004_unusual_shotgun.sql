CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`window_start` integer NOT NULL,
	`count` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `ai_audits` ADD `basis` text DEFAULT 'verified' NOT NULL;