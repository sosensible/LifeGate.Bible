CREATE TABLE `category_plans` (
	`category_id` text PRIMARY KEY NOT NULL,
	`source` text DEFAULT 'custom' NOT NULL,
	`kind` text DEFAULT 'add' NOT NULL,
	`cadence` text DEFAULT 'monthly' NOT NULL,
	`amount_cents` integer DEFAULT 0 NOT NULL,
	`due_on` text,
	`deadline` text DEFAULT 'byDate' NOT NULL,
	`repeat` text DEFAULT 'none' NOT NULL,
	`start_month` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `recurring_occurrences` (
	`recurring_id` text NOT NULL,
	`due_on` text NOT NULL,
	`status` text NOT NULL,
	`transaction_id` text,
	`handled_at` integer NOT NULL,
	PRIMARY KEY(`recurring_id`, `due_on`),
	FOREIGN KEY (`recurring_id`) REFERENCES `recurring_transactions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`transaction_id`) REFERENCES `finance_transactions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `recurring_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`payee` text,
	`memo` text,
	`amount_cents` integer NOT NULL,
	`amount_varies` integer DEFAULT false NOT NULL,
	`frequency` text NOT NULL,
	`anchor_on` text NOT NULL,
	`end_on` text,
	`account_id` text,
	`category_id` text,
	`feeds_plan` integer DEFAULT false NOT NULL,
	`match_bank` integer DEFAULT false NOT NULL,
	`match_text` text,
	`auto_enter` integer DEFAULT false NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `finance_accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `recurring_transactions_category_idx` ON `recurring_transactions` (`category_id`);