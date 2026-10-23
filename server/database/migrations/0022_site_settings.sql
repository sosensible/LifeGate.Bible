CREATE TABLE `site_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`short_name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`street` text DEFAULT '' NOT NULL,
	`city` text DEFAULT '' NOT NULL,
	`region` text DEFAULT '' NOT NULL,
	`postal_code` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`contact_email` text DEFAULT '' NOT NULL,
	`service_times` text NOT NULL,
	`logo_version` integer DEFAULT 0 NOT NULL,
	`logo_width` integer DEFAULT 1 NOT NULL,
	`logo_height` integer DEFAULT 1 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
-- A neutral starting point, so a church that reuses this code does not inherit anyone
-- else's name. Each church sets its own on /admin/site.
INSERT INTO `site_settings` (`id`, `name`, `short_name`, `description`, `service_times`, `logo_version`, `logo_width`, `logo_height`, `updated_at`) VALUES
  ('site', 'Your Church Name', 'Church', 'Welcome to our church.', '[]', 0, 864, 864, unixepoch());
