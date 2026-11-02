CREATE TABLE `sermon_files` (
	`id` text PRIMARY KEY NOT NULL,
	`sermon_id` text NOT NULL,
	`relative_path` text NOT NULL,
	`file_name` text NOT NULL,
	`size` integer NOT NULL,
	`sha256` text NOT NULL,
	`stored_by` text,
	`stored_at` integer NOT NULL,
	FOREIGN KEY (`sermon_id`) REFERENCES `sermons`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`stored_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sermon_files_sermon_idx` ON `sermon_files` (`sermon_id`);