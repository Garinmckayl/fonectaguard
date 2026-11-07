CREATE TABLE `cn_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`kind` text NOT NULL,
	`params_json` text NOT NULL,
	`source` text DEFAULT 'owner' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cnr_biz` ON `cn_rules` (`business_id`);