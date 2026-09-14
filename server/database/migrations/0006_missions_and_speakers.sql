CREATE TABLE `mission_organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`photo` text,
	`writeup` text,
	`website` text,
	`relationship` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mission_organizations_slug_unique` ON `mission_organizations` (`slug`);--> statement-breakpoint
CREATE TABLE `mission_updates` (
	`id` text PRIMARY KEY NOT NULL,
	`missionary_id` text NOT NULL,
	`kind` text NOT NULL,
	`posted_on` text NOT NULL,
	`title` text,
	`body` text,
	`url` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`missionary_id`) REFERENCES `missionaries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `mission_updates_missionary_idx` ON `mission_updates` (`missionary_id`,`posted_on`);--> statement-breakpoint
CREATE TABLE `missionaries` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`photo` text,
	`writeup` text,
	`family_names` text,
	`field` text,
	`focus` text,
	`organization_id` text,
	`status` text DEFAULT 'onField' NOT NULL,
	`started_year` integer,
	`support_url` text,
	`email` text,
	`phone` text,
	`mailing_address` text,
	`website` text,
	`share_contact` integer DEFAULT false NOT NULL,
	`next_visit_on` text,
	`next_visit_note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `mission_organizations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `missionaries_slug_unique` ON `missionaries` (`slug`);--> statement-breakpoint
CREATE INDEX `missionaries_organization_idx` ON `missionaries` (`organization_id`);--> statement-breakpoint
ALTER TABLE `people` ADD `kind` text DEFAULT 'member' NOT NULL;--> statement-breakpoint
ALTER TABLE `people` ADD `is_speaker` integer DEFAULT false NOT NULL;