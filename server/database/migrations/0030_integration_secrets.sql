CREATE TABLE `integration_secrets` (
	`name` text PRIMARY KEY NOT NULL,
	`value_encrypted` text NOT NULL,
	`updated_by` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
