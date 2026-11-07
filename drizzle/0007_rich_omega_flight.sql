ALTER TABLE `cn_businesses` ADD `mobile` text;--> statement-breakpoint
ALTER TABLE `cn_messages` ADD `sms_to` text;--> statement-breakpoint
ALTER TABLE `cn_suggestions` ADD `tier` text DEFAULT 'one_tap' NOT NULL;--> statement-breakpoint
ALTER TABLE `cn_suggestions` ADD `options_json` text;--> statement-breakpoint
ALTER TABLE `cn_suggestions` ADD `cost_json` text;
