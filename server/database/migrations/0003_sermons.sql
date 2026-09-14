CREATE TABLE `sermon_series` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sermon_series_name_unique` ON `sermon_series` (`name`);--> statement-breakpoint
CREATE TABLE `sermons` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`preached_on` text NOT NULL,
	`speaker` text NOT NULL,
	`series_id` text,
	`scripture` text,
	`books` text DEFAULT '[]' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`description` text,
	`video_provider` text,
	`video_id` text,
	`visibility` text DEFAULT 'members' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`published_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`series_id`) REFERENCES `sermon_series`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sermons_slug_unique` ON `sermons` (`slug`);--> statement-breakpoint
CREATE INDEX `sermons_listing_idx` ON `sermons` (`status`,`preached_on`);--> statement-breakpoint
CREATE INDEX `sermons_series_idx` ON `sermons` (`series_id`);