ALTER TABLE `ministry_members` ADD `is_leader` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `ministry_members` ADD `show_to_members` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `ministry_members` ADD `show_publicly` integer DEFAULT false NOT NULL;