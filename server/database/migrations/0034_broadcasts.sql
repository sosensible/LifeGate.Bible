CREATE TABLE `broadcast_passes` (
	`id` text PRIMARY KEY NOT NULL,
	`broadcast_id` text NOT NULL,
	`label` text NOT NULL,
	`code_hash` text NOT NULL,
	`device_hash` text,
	`created_by` text,
	`created_at` integer NOT NULL,
	`used_at` integer,
	`revoked_at` integer,
	FOREIGN KEY (`broadcast_id`) REFERENCES `broadcasts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `broadcast_passes_code_idx` ON `broadcast_passes` (`broadcast_id`,`code_hash`);--> statement-breakpoint
CREATE TABLE `broadcast_seats` (
	`broadcast_id` text NOT NULL,
	`viewer_key` text NOT NULL,
	`taken_at` integer NOT NULL,
	PRIMARY KEY(`broadcast_id`, `viewer_key`),
	FOREIGN KEY (`broadcast_id`) REFERENCES `broadcasts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `broadcasts` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`stream_url` text NOT NULL,
	`audience` text DEFAULT 'members' NOT NULL,
	`max_viewers` integer,
	`is_open` integer DEFAULT false NOT NULL,
	`opens_at` integer,
	`closes_at` integer,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `broadcasts_slug_unique` ON `broadcasts` (`slug`);