CREATE TABLE `ministry_list_completions` (
	`id` text PRIMARY KEY NOT NULL,
	`list_id` text NOT NULL,
	`item_id` text NOT NULL,
	`item_title` text NOT NULL,
	`done_by` text,
	`done_by_name` text NOT NULL,
	`done_at` integer NOT NULL,
	`undone_at` integer,
	FOREIGN KEY (`list_id`) REFERENCES `ministry_lists`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`done_by`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `ministry_list_completions_list_idx` ON `ministry_list_completions` (`list_id`,`done_at`);--> statement-breakpoint
CREATE TABLE `ministry_list_items` (
	`id` text PRIMARY KEY NOT NULL,
	`list_id` text NOT NULL,
	`title` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`assignee_id` text,
	`assigned_by` text,
	`assigned_at` integer,
	`due_date` text,
	`due_time` text,
	`unassigned_at` integer,
	`unassigned_note` text,
	`done_at` integer,
	`done_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`list_id`) REFERENCES `ministry_lists`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assignee_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`assigned_by`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`done_by`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `ministry_list_items_list_idx` ON `ministry_list_items` (`list_id`);--> statement-breakpoint
CREATE INDEX `ministry_list_items_assignee_idx` ON `ministry_list_items` (`assignee_id`);--> statement-breakpoint
CREATE TABLE `ministry_lists` (
	`id` text PRIMARY KEY NOT NULL,
	`ministry_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text DEFAULT 'list' NOT NULL,
	`audience` text DEFAULT 'ministry' NOT NULL,
	`ordered` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`ministry_id`) REFERENCES `ministries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `ministry_lists_ministry_idx` ON `ministry_lists` (`ministry_id`);