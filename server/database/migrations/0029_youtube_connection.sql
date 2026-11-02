CREATE TABLE `youtube_connection` (
	`id` text PRIMARY KEY NOT NULL,
	`channel_id` text NOT NULL,
	`channel_title` text NOT NULL,
	`refresh_token_encrypted` text NOT NULL,
	`connected_by` text,
	`connected_at` integer NOT NULL,
	FOREIGN KEY (`connected_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
