CREATE TABLE `cn_businesses` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`city` text,
	`country` text NOT NULL,
	`segment` text,
	`story` text,
	`language` text DEFAULT 'en' NOT NULL,
	`channel` text DEFAULT 'EMAIL' NOT NULL,
	`contact_name` text,
	`best_window` text,
	`standing` integer DEFAULT 0 NOT NULL,
	`opted_out` integer DEFAULT 0 NOT NULL,
	`email` text,
	`telegram_chat_id` text,
	`link_code` text NOT NULL,
	`publishers_json` text,
	`regular_json` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cn_events` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`suggestion_id` text,
	`type` text NOT NULL,
	`detail_json` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cne_biz` ON `cn_events` (`business_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `cn_memory` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`day_key` text NOT NULL,
	`last_hours` text,
	`approvals` integer DEFAULT 0 NOT NULL,
	`edits` integer DEFAULT 0 NOT NULL,
	`declines` integer DEFAULT 0 NOT NULL,
	`close_shift_min` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cnm_uq` ON `cn_memory` (`business_id`,`day_key`);--> statement-breakpoint
CREATE TABLE `cn_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`channel` text NOT NULL,
	`language` text NOT NULL,
	`token` text NOT NULL,
	`rendered_json` text NOT NULL,
	`delivered_via` text,
	`external_ref` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cnmsg_token` ON `cn_messages` (`token`);--> statement-breakpoint
CREATE TABLE `cn_suggestions` (
	`id` text PRIMARY KEY NOT NULL,
	`business_id` text NOT NULL,
	`date` text NOT NULL,
	`day_key` text NOT NULL,
	`action` text NOT NULL,
	`shown` text NOT NULL,
	`proposed` text,
	`confidence` real NOT NULL,
	`basis` text NOT NULL,
	`reasons_json` text NOT NULL,
	`views_est` real DEFAULT 0 NOT NULL,
	`status` text NOT NULL,
	`final_hours` text,
	`token` text NOT NULL,
	`message_id` text,
	`note` text,
	`undo_json` text,
	`created_at` integer NOT NULL,
	`sent_at` integer,
	`decided_at` integer,
	`applied_at` integer
);
--> statement-breakpoint
CREATE INDEX `cns_biz` ON `cn_suggestions` (`business_id`,`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `cns_token` ON `cn_suggestions` (`token`);--> statement-breakpoint
CREATE UNIQUE INDEX `cns_uq` ON `cn_suggestions` (`business_id`,`date`);