CREATE TABLE `channel_mutes` (
	`user_id` text NOT NULL,
	`channel_id` text NOT NULL,
	PRIMARY KEY(`user_id`, `channel_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`channel_id`) REFERENCES `notification_channels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `church_notification_senders` (
	`user_id` text PRIMARY KEY NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `notification_channels` (
	`id` text PRIMARY KEY NOT NULL,
	`ministry_id` text,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`ministry_id`) REFERENCES `ministries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notification_channels_ministry_idx` ON `notification_channels` (`ministry_id`);--> statement-breakpoint
CREATE TABLE `notification_receipts` (
	`notification_id` text NOT NULL,
	`user_id` text NOT NULL,
	`read_at` integer,
	PRIMARY KEY(`notification_id`, `user_id`),
	FOREIGN KEY (`notification_id`) REFERENCES `notifications`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notification_receipts_user_idx` ON `notification_receipts` (`user_id`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`channel_id` text,
	`ministry_id` text,
	`sender_user_id` text,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`url` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`channel_id`) REFERENCES `notification_channels`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ministry_id`) REFERENCES `ministries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sender_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `notifications_channel_idx` ON `notifications` (`channel_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `notifications_created_idx` ON `notifications` (`created_at`);--> statement-breakpoint
ALTER TABLE `ministries` ADD `task_notify` text DEFAULT 'both' NOT NULL;--> statement-breakpoint
ALTER TABLE `ministry_lists` ADD `task_notify` text;--> statement-breakpoint
ALTER TABLE `site_settings` ADD `notify_max_per_day` integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE `site_settings` ADD `notify_keep_days` integer DEFAULT 90 NOT NULL;--> statement-breakpoint
ALTER TABLE `site_settings` ADD `quiet_start` text DEFAULT '21:00' NOT NULL;--> statement-breakpoint
ALTER TABLE `site_settings` ADD `quiet_end` text DEFAULT '07:00' NOT NULL;--> statement-breakpoint
-- Every ministry starts with one channel, and the church with one for everyone.
-- The ids are random hex, like the application's own.
INSERT INTO `notification_channels` (`id`, `ministry_id`, `name`, `description`, `sort_order`, `created_at`)
  SELECT lower(hex(randomblob(16))), `id`, 'General', 'News and reminders for everyone serving here.', 0, unixepoch() FROM `ministries`;
--> statement-breakpoint
INSERT INTO `notification_channels` (`id`, `ministry_id`, `name`, `description`, `sort_order`, `created_at`)
  VALUES (lower(hex(randomblob(16))), NULL, 'Church announcements', 'News for the whole church family.', 0, unixepoch());
