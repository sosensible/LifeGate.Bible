CREATE TABLE `folder_moves` (
	`id` text PRIMARY KEY NOT NULL,
	`from_path` text NOT NULL,
	`to_path` text NOT NULL,
	`state` text NOT NULL,
	`files_total` integer NOT NULL,
	`files_moved` integer DEFAULT 0 NOT NULL,
	`bytes_total` integer NOT NULL,
	`bytes_moved` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`started_by` text,
	`started_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`started_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
