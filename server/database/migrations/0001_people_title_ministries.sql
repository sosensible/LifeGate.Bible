CREATE TABLE `ministries` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ministries_slug_unique` ON `ministries` (`slug`);--> statement-breakpoint
CREATE TABLE `ministry_members` (
	`ministry_id` text NOT NULL,
	`person_id` text NOT NULL,
	PRIMARY KEY(`ministry_id`, `person_id`),
	FOREIGN KEY (`ministry_id`) REFERENCES `ministries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ministry_members_person_idx` ON `ministry_members` (`person_id`);--> statement-breakpoint
ALTER TABLE `people` ADD `title` text;