CREATE TABLE `ssa_publish_record` (
	`id` varchar(32) NOT NULL,
	`workspace_id` varchar(32) NOT NULL,
	`project_id` varchar(32) NOT NULL,
	`post_id` varchar(32) NOT NULL,
	`platform` varchar(20) NOT NULL,
	`account_id` varchar(32) NOT NULL,
	`account_name` varchar(128),
	`remote_id` varchar(64),
	`remote_url` varchar(500),
	`outcome` varchar(20) NOT NULL,
	`failure_reason` varchar(1000),
	`post_type` varchar(20),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ssa_publish_record_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_pubrec_post` ON `ssa_publish_record` (`post_id`);--> statement-breakpoint
CREATE INDEX `idx_pubrec_project` ON `ssa_publish_record` (`project_id`);