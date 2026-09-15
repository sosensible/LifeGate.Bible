ALTER TABLE `sermons` ADD `speaker_person_id` text REFERENCES people(id) ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX `sermons_speaker_person_idx` ON `sermons` (`speaker_person_id`);--> statement-breakpoint
-- Link existing messages to the Speakers list where the speaker's name matches
-- exactly one person on it. Anything else stays a typed name.
UPDATE `sermons` SET `speaker_person_id` = (
  SELECT `p`.`id` FROM `people` `p`
  WHERE `p`.`is_speaker` = 1 AND trim(`p`.`first_name` || ' ' || `p`.`last_name`) = trim(`sermons`.`speaker`)
)
WHERE `speaker_person_id` IS NULL AND (
  SELECT count(*) FROM `people` `p`
  WHERE `p`.`is_speaker` = 1 AND trim(`p`.`first_name` || ' ' || `p`.`last_name`) = trim(`sermons`.`speaker`)
) = 1;
