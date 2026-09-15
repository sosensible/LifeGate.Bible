CREATE TABLE `gifts` (
	`id` text PRIMARY KEY NOT NULL,
	`count_id` text NOT NULL,
	`giver_id` text,
	`category_id` text,
	`amount_cents` integer NOT NULL,
	`method` text NOT NULL,
	`check_number` text,
	`received_on` text NOT NULL,
	`memo` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`count_id`) REFERENCES `offering_counts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`giver_id`) REFERENCES `givers`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `gifts_giver_idx` ON `gifts` (`giver_id`,`received_on`);--> statement-breakpoint
CREATE INDEX `gifts_count_idx` ON `gifts` (`count_id`);--> statement-breakpoint
CREATE TABLE `givers` (
	`id` text PRIMARY KEY NOT NULL,
	`household_id` text,
	`person_id` text,
	`statement_name` text NOT NULL,
	`mailing_address` text,
	`email` text,
	`delivery` text DEFAULT 'mail' NOT NULL,
	`notes` text,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`household_id`) REFERENCES `households`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`person_id`) REFERENCES `people`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `givers_name_idx` ON `givers` (`statement_name`);--> statement-breakpoint
CREATE INDEX `givers_household_idx` ON `givers` (`household_id`);--> statement-breakpoint
CREATE INDEX `givers_person_idx` ON `givers` (`person_id`);--> statement-breakpoint
CREATE TABLE `offering_counts` (
	`id` text PRIMARY KEY NOT NULL,
	`counted_on` text NOT NULL,
	`label` text,
	`status` text DEFAULT 'open' NOT NULL,
	`expected_cash_cents` integer DEFAULT 0 NOT NULL,
	`expected_check_cents` integer DEFAULT 0 NOT NULL,
	`counter_names` text,
	`notes` text,
	`opened_by_user_id` text,
	`closed_by_user_id` text,
	`closed_at` integer,
	`deposit_transaction_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`opened_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`closed_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`deposit_transaction_id`) REFERENCES `finance_transactions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `offering_counts_counted_idx` ON `offering_counts` (`counted_on`);--> statement-breakpoint
CREATE TABLE `statement_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`giver_id` text NOT NULL,
	`year` integer NOT NULL,
	`method` text NOT NULL,
	`sent_to` text,
	`status` text NOT NULL,
	`error` text,
	`total_cents` integer NOT NULL,
	`sent_by_user_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`giver_id`) REFERENCES `givers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sent_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `statement_deliveries_giver_idx` ON `statement_deliveries` (`giver_id`,`year`);--> statement-breakpoint
CREATE TABLE `statement_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`legal_name` text NOT NULL,
	`mailing_address` text,
	`ein` text,
	`signer_name` text,
	`signer_title` text,
	`closing_message` text,
	`email_subject` text,
	`updated_at` integer NOT NULL
);
