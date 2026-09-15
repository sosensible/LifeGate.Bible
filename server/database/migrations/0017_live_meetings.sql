CREATE TABLE `live_meetings` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`kind` text NOT NULL,
	`link` text NOT NULL,
	`visibility` text DEFAULT 'members' NOT NULL,
	`repeat` text NOT NULL,
	`starts_on` text NOT NULL,
	`ends_on` text,
	`start_time` text NOT NULL,
	`end_time` text NOT NULL,
	`skipped_dates` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
