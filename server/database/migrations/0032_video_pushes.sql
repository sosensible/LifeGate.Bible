CREATE TABLE `video_pushes` (
	`sermon_id` text NOT NULL,
	`target` text NOT NULL,
	`state` text NOT NULL,
	`sha256` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`next_attempt_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`sermon_id`, `target`),
	FOREIGN KEY (`sermon_id`) REFERENCES `sermons`(`id`) ON UPDATE no action ON DELETE cascade
);
