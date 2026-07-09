CREATE TABLE `ssa_billing_usage_record` (
	`id` varchar(32) NOT NULL,
	`user_id` varchar(32) NOT NULL,
	`workspace_id` varchar(32) NOT NULL,
	`project_id` varchar(32) NOT NULL,
	`action_type` varchar(40) NOT NULL,
	`estimated_credits` int NOT NULL,
	`actual_credits` int,
	`provider_cost` decimal(12,6),
	`model` varchar(128),
	`status` varchar(20) NOT NULL DEFAULT 'estimated',
	`reservation_id` varchar(64),
	`glbgpt_ref` varchar(64),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ssa_billing_usage_record_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ssa_calendar_item` (
	`id` varchar(32) NOT NULL,
	`workspace_id` varchar(32) NOT NULL,
	`project_id` varchar(32) NOT NULL,
	`post_id` varchar(32),
	`topic` varchar(500) NOT NULL,
	`date` varchar(40),
	`time` varchar(10),
	`status` varchar(30) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ssa_calendar_item_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ssa_calendar_job` (
	`id` varchar(32) NOT NULL,
	`calendar_item_id` varchar(32) NOT NULL,
	`project_id` varchar(32) NOT NULL,
	`platform` varchar(20) NOT NULL,
	`account` varchar(200),
	`time` varchar(10),
	`publish_mode` varchar(10),
	`status` varchar(30) NOT NULL,
	`reason` varchar(500),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ssa_calendar_job_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ssa_generation_job` (
	`id` varchar(32) NOT NULL,
	`workspace_id` varchar(32) NOT NULL,
	`project_id` varchar(32) NOT NULL,
	`user_id` varchar(32) NOT NULL,
	`action_type` varchar(40) NOT NULL,
	`status` varchar(20) NOT NULL DEFAULT 'pending',
	`input_json` json,
	`output_json` json,
	`model` varchar(128),
	`vendor` varchar(128),
	`request_tokens` bigint,
	`response_tokens` bigint,
	`estimated_credits` int,
	`actual_credits` int,
	`billing_record_id` varchar(32),
	`error_code` varchar(40),
	`error_message` varchar(1000),
	`trace_id` varchar(64),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ssa_generation_job_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ssa_media_asset` (
	`id` varchar(32) NOT NULL,
	`workspace_id` varchar(32) NOT NULL,
	`project_id` varchar(32) NOT NULL,
	`post_id` varchar(32),
	`variant_id` varchar(32),
	`kind` varchar(20) NOT NULL DEFAULT 'image',
	`url` varchar(1000) NOT NULL,
	`mime_type` varchar(50),
	`ratio` varchar(20),
	`prompt` text,
	`model` varchar(128),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ssa_media_asset_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ssa_plan` (
	`id` varchar(32) NOT NULL,
	`workspace_id` varchar(32) NOT NULL,
	`project_id` varchar(32) NOT NULL,
	`plan_name` varchar(200) NOT NULL,
	`primary_goal` varchar(64),
	`topic_theme` varchar(1000),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ssa_plan_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ssa_plan_item` (
	`id` varchar(32) NOT NULL,
	`plan_id` varchar(32) NOT NULL,
	`project_id` varchar(32) NOT NULL,
	`date` varchar(40),
	`time` varchar(10),
	`topic` varchar(500) NOT NULL,
	`pillar` varchar(100),
	`goal` varchar(64),
	`platforms` json NOT NULL DEFAULT ('[]'),
	`asset_type` varchar(64),
	`cta` varchar(200),
	`status` varchar(30) NOT NULL DEFAULT 'Planned',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ssa_plan_item_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ssa_platform_prompt` (
	`id` varchar(32) NOT NULL,
	`platform` varchar(20) NOT NULL,
	`action_type` varchar(40) NOT NULL,
	`template` text NOT NULL,
	`enabled` tinyint NOT NULL DEFAULT 1,
	`updated_by` varchar(32),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ssa_platform_prompt_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_prompt_platform_action` UNIQUE(`platform`,`action_type`)
);
--> statement-breakpoint
CREATE TABLE `ssa_post` (
	`id` varchar(32) NOT NULL,
	`workspace_id` varchar(32) NOT NULL,
	`project_id` varchar(32) NOT NULL,
	`title` varchar(500) NOT NULL,
	`platforms` json NOT NULL DEFAULT ('[]'),
	`asset_type` varchar(64),
	`status` varchar(30) NOT NULL,
	`tags` json NOT NULL DEFAULT ('[]'),
	`owner` varchar(20),
	`has_image` tinyint NOT NULL DEFAULT 0,
	`failure_reason` varchar(1000),
	`source` varchar(30),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ssa_post_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ssa_post_variant` (
	`id` varchar(32) NOT NULL,
	`post_id` varchar(32) NOT NULL,
	`project_id` varchar(32) NOT NULL,
	`platform` varchar(20) NOT NULL,
	`account` varchar(200),
	`account_type` varchar(20),
	`hook` text,
	`body` text,
	`hashtags` varchar(500),
	`cta` varchar(200),
	`cta_url` varchar(512),
	`format` varchar(100),
	`media_asset` varchar(100),
	`media_asset_id` varchar(32),
	`publish_mode` varchar(10),
	`state` varchar(30),
	`suggested_time` varchar(10),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ssa_post_variant_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ssa_project` (
	`id` varchar(32) NOT NULL,
	`workspace_id` varchar(32) NOT NULL,
	`brand_name` varchar(200) NOT NULL,
	`description` text,
	`target_market` varchar(64),
	`platforms` json NOT NULL DEFAULT ('[]'),
	`primary_goal` varchar(64),
	`website_url` varchar(512),
	`tone` varchar(255),
	`product_url` varchar(512),
	`target_audience` varchar(500),
	`content_goals` json NOT NULL DEFAULT ('[]'),
	`weekly_frequency` int NOT NULL DEFAULT 5,
	`default_cta` varchar(200),
	`hashtags` varchar(500),
	`forbidden_topics` varchar(500),
	`brand_colors` varchar(255),
	`visual_style` varchar(255),
	`logo_asset_id` varchar(32),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ssa_project_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ssa_social_account` (
	`id` varchar(32) NOT NULL,
	`workspace_id` varchar(32) NOT NULL,
	`platform` varchar(20) NOT NULL,
	`type` varchar(20) NOT NULL,
	`name` varchar(200) NOT NULL,
	`url` varchar(512),
	`status` varchar(30) NOT NULL,
	`expires_at` varchar(30),
	`capabilities` varchar(500),
	`notes` varchar(500),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ssa_social_account_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ssa_workspace` (
	`id` varchar(32) NOT NULL,
	`user_id` varchar(32) NOT NULL,
	`name` varchar(200) NOT NULL,
	`timezone` varchar(64) NOT NULL DEFAULT 'America/Los_Angeles',
	`active_project_id` varchar(32),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ssa_workspace_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_workspace_user` UNIQUE(`user_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_billing_user` ON `ssa_billing_usage_record` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_cal_project` ON `ssa_calendar_item` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_caljob_item` ON `ssa_calendar_job` (`calendar_item_id`);--> statement-breakpoint
CREATE INDEX `idx_genjob_project` ON `ssa_generation_job` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_media_project` ON `ssa_media_asset` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_plan_project` ON `ssa_plan` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_planitem_plan` ON `ssa_plan_item` (`plan_id`);--> statement-breakpoint
CREATE INDEX `idx_post_project` ON `ssa_post` (`project_id`);--> statement-breakpoint
CREATE INDEX `idx_post_project_status` ON `ssa_post` (`project_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_variant_post` ON `ssa_post_variant` (`post_id`);--> statement-breakpoint
CREATE INDEX `idx_project_workspace` ON `ssa_project` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `idx_account_workspace` ON `ssa_social_account` (`workspace_id`);