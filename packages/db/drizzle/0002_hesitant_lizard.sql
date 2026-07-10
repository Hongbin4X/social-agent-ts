ALTER TABLE `ssa_social_account` ADD `external_account_id` varchar(64);--> statement-breakpoint
ALTER TABLE `ssa_social_account` ADD `username` varchar(64);--> statement-breakpoint
ALTER TABLE `ssa_social_account` ADD `access_token` text;--> statement-breakpoint
ALTER TABLE `ssa_social_account` ADD `refresh_token` text;--> statement-breakpoint
ALTER TABLE `ssa_social_account` ADD `scope` varchar(255);--> statement-breakpoint
ALTER TABLE `ssa_social_account` ADD `token_expires_at` bigint;--> statement-breakpoint
ALTER TABLE `ssa_social_account` ADD CONSTRAINT `uq_account_external` UNIQUE(`workspace_id`,`platform`,`external_account_id`);