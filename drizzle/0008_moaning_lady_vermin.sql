CREATE TABLE `cn_changes` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`type` text NOT NULL,
	`payload_json` text NOT NULL,
	`source` text NOT NULL,
	`status` text NOT NULL,
	`undo_json` text,
	`note` text,
	`created_at` integer NOT NULL,
	`applied_at` integer
);
--> statement-breakpoint
CREATE INDEX `cnc_biz` ON `cn_changes` (`business_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `cn_businesses` ADD `voice` integer DEFAULT 0 NOT NULL;