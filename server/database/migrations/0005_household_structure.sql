ALTER TABLE `households` ADD `kind` text DEFAULT 'married' NOT NULL;--> statement-breakpoint
ALTER TABLE `households` ADD `relationship` text DEFAULT 'family' NOT NULL;--> statement-breakpoint
ALTER TABLE `households` ADD `name_is_custom` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `people` ADD `household_role` text;--> statement-breakpoint
-- Households created before these rules keep the names people typed, and
-- show as needing setup until someone assigns who runs the house.
UPDATE `households` SET `name_is_custom` = 1;
