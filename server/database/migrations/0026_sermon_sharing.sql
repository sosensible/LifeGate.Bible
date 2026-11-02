CREATE TABLE `sermon_holds` (
	`sermon_id` text NOT NULL,
	`party` text NOT NULL,
	`placed_by` text,
	`placed_at` integer NOT NULL,
	PRIMARY KEY(`sermon_id`, `party`),
	FOREIGN KEY (`sermon_id`) REFERENCES `sermons`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`placed_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
ALTER TABLE `sermons` ADD `teacher_share` text DEFAULT 'public' NOT NULL;