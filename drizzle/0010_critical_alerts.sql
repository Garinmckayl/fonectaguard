CREATE TABLE `cn_alerts` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`scenario` text NOT NULL,
	`ref_id` text NOT NULL,
	`step` text NOT NULL,
	`outcome` text NOT NULL,
	`detail_json` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cna_ref` ON `cn_alerts` (`business_id`,`ref_id`);