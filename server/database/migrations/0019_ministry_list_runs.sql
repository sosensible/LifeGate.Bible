ALTER TABLE `ministry_lists` ADD `routine_id` text REFERENCES ministry_lists(id) ON DELETE cascade;--> statement-breakpoint
ALTER TABLE `ministry_lists` ADD `ended_at` integer;--> statement-breakpoint
ALTER TABLE `ministry_lists` ADD `ended_how` text;--> statement-breakpoint
CREATE INDEX `ministry_lists_routine_idx` ON `ministry_lists` (`routine_id`);