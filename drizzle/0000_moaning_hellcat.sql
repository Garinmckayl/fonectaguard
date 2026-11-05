CREATE TABLE `agent_events` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`location_id` text,
	`scan_run_id` text,
	`event_type` text NOT NULL,
	`message` text NOT NULL,
	`metadata_json` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ev_loc` ON `agent_events` (`location_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `ev_scan` ON `agent_events` (`scan_run_id`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text,
	`action` text NOT NULL,
	`detail_json` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `business_locations` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`business_name` text NOT NULL,
	`website` text,
	`country` text,
	`city` text,
	`address_json` text,
	`phone` text,
	`email` text,
	`category` text,
	`description` text,
	`hours_json` text,
	`timezone` text,
	`verification_status` text DEFAULT 'unverified' NOT NULL,
	`monitoring_frequency` text DEFAULT 'daily' NOT NULL,
	`next_scan_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `bl_org` ON `business_locations` (`organization_id`);--> statement-breakpoint
CREATE INDEX `bl_due` ON `business_locations` (`next_scan_at`);--> statement-breakpoint
CREATE TABLE `canonical_field_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`location_id` text NOT NULL,
	`field_name` text NOT NULL,
	`normalized_value_json` text NOT NULL,
	`verified_by` text NOT NULL,
	`verification_source` text NOT NULL,
	`verified_at` integer NOT NULL,
	`version` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cfv_uq` ON `canonical_field_versions` (`location_id`,`field_name`,`version`);--> statement-breakpoint
CREATE TABLE `connections` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`platform` text NOT NULL,
	`external_account_id` text,
	`status` text NOT NULL,
	`capabilities_json` text NOT NULL,
	`encrypted_credential_reference` text,
	`expires_at` integer,
	`last_synced_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `conn_uq` ON `connections` (`organization_id`,`platform`,`external_account_id`);--> statement-breakpoint
CREATE TABLE `demo_listings` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`platform` text NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`address` text NOT NULL,
	`phone` text NOT NULL,
	`hours` text NOT NULL,
	`website` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `demo_listings_slug_unique` ON `demo_listings` (`slug`);--> statement-breakpoint
CREATE TABLE `discrepancies` (
	`id` text PRIMARY KEY NOT NULL,
	`location_id` text NOT NULL,
	`listing_id` text NOT NULL,
	`field_name` text NOT NULL,
	`canonical_version_id` text,
	`observed_value_json` text,
	`expected_value_json` text,
	`severity` text NOT NULL,
	`confidence` real NOT NULL,
	`explanation` text NOT NULL,
	`impact` text NOT NULL,
	`classification` text NOT NULL,
	`status` text NOT NULL,
	`first_detected_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`resolved_at` integer
);
--> statement-breakpoint
CREATE INDEX `disc_loc` ON `discrepancies` (`location_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `disc_active` ON `discrepancies` (`listing_id`,`field_name`) WHERE status NOT IN ('resolved','dismissed');--> statement-breakpoint
CREATE TABLE `health_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`location_id` text NOT NULL,
	`monitored_fields` integer NOT NULL,
	`matching_fields` integer NOT NULL,
	`score` real NOT NULL,
	`sources` integer DEFAULT 0 NOT NULL,
	`recorded_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `hs_loc` ON `health_snapshots` (`location_id`,`recorded_at`);--> statement-breakpoint
CREATE TABLE `listing_observations` (
	`id` text PRIMARY KEY NOT NULL,
	`listing_id` text NOT NULL,
	`observed_data_json` text NOT NULL,
	`evidence_json` text NOT NULL,
	`observed_at` integer NOT NULL,
	`content_hash` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `obs_listing` ON `listing_observations` (`listing_id`,`observed_at`);--> statement-breakpoint
CREATE TABLE `listings` (
	`id` text PRIMARY KEY NOT NULL,
	`location_id` text NOT NULL,
	`connection_id` text,
	`platform` text NOT NULL,
	`external_listing_id` text,
	`url` text NOT NULL,
	`identity_confidence` real NOT NULL,
	`status` text DEFAULT 'monitoring' NOT NULL,
	`last_scanned_at` integer,
	`discovered_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `listing_uq` ON `listings` (`location_id`,`url`);--> statement-breakpoint
CREATE INDEX `listing_loc` ON `listings` (`location_id`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`dedupe_key` text,
	`payload_json` text NOT NULL,
	`read_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notif_dedupe` ON `notifications` (`user_id`,`dedupe_key`);--> statement-breakpoint
CREATE TABLE `organization_members` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `om_uq` ON `organization_members` (`organization_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`is_demo` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `repair_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`proposal_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`connector_response_json` text,
	`status` text NOT NULL,
	`attempted_at` integer NOT NULL,
	`verified_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `repair_attempts_idempotency_key_unique` ON `repair_attempts` (`idempotency_key`);--> statement-breakpoint
CREATE TABLE `repair_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`discrepancy_id` text NOT NULL,
	`target_platform` text NOT NULL,
	`proposed_change_json` text NOT NULL,
	`evidence_json` text NOT NULL,
	`confidence` real NOT NULL,
	`explanation` text NOT NULL,
	`status` text NOT NULL,
	`approved_by` text,
	`approved_at` integer,
	`approved_payload_json` text,
	`workflow_instance_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rp_status` ON `repair_proposals` (`status`);--> statement-breakpoint
CREATE INDEX `rp_disc` ON `repair_proposals` (`discrepancy_id`);--> statement-breakpoint
CREATE TABLE `scan_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`location_id` text NOT NULL,
	`status` text NOT NULL,
	`trigger_type` text NOT NULL,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	`listings_scanned` integer DEFAULT 0 NOT NULL,
	`issues_found` integer DEFAULT 0 NOT NULL,
	`error_json` text
);
--> statement-breakpoint
CREATE INDEX `scan_loc` ON `scan_runs` (`location_id`,`started_at`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);