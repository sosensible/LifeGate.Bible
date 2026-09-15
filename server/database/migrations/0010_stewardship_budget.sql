CREATE TABLE `categories` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text DEFAULT 'spending' NOT NULL,
	`rollover` integer DEFAULT true NOT NULL,
	`is_sensitive` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `category_groups`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `categories_group_idx` ON `categories` (`group_id`);--> statement-breakpoint
CREATE TABLE `category_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `category_months` (
	`category_id` text NOT NULL,
	`month` text NOT NULL,
	`funded_cents` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`category_id`, `month`),
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `finance_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`kind` text DEFAULT 'checking' NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`external_id` text,
	`institution` text,
	`balance_cents` integer,
	`balance_date` integer,
	`opening_balance_cents` integer DEFAULT 0 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `finance_accounts_external_id_unique` ON `finance_accounts` (`external_id`);--> statement-breakpoint
CREATE TABLE `finance_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`external_id` text,
	`posted_on` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`bank_description` text,
	`payee` text,
	`memo` text,
	`is_transfer` integer DEFAULT false NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `finance_accounts`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `finance_transactions_external_idx` ON `finance_transactions` (`account_id`,`external_id`);--> statement-breakpoint
CREATE INDEX `finance_transactions_posted_idx` ON `finance_transactions` (`posted_on`);--> statement-breakpoint
CREATE TABLE `ministry_category_access` (
	`ministry_id` text NOT NULL,
	`category_id` text NOT NULL,
	`level` text NOT NULL,
	`audience` text DEFAULT 'leaders' NOT NULL,
	`granted_by_user_id` text,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`ministry_id`, `category_id`),
	FOREIGN KEY (`ministry_id`) REFERENCES `ministries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`granted_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `ministry_category_access_category_idx` ON `ministry_category_access` (`category_id`);--> statement-breakpoint
CREATE TABLE `payee_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`match_text` text NOT NULL,
	`payee` text,
	`category_id` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sync_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`status` text DEFAULT 'running' NOT NULL,
	`accounts_seen` integer DEFAULT 0 NOT NULL,
	`transactions_added` integer DEFAULT 0 NOT NULL,
	`messages` text DEFAULT '[]' NOT NULL,
	`triggered_by_user_id` text,
	FOREIGN KEY (`triggered_by_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `sync_runs_started_idx` ON `sync_runs` (`started_at`);--> statement-breakpoint
CREATE TABLE `transaction_splits` (
	`id` text PRIMARY KEY NOT NULL,
	`transaction_id` text NOT NULL,
	`category_id` text,
	`amount_cents` integer NOT NULL,
	`memo` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`transaction_id`) REFERENCES `finance_transactions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `transaction_splits_transaction_idx` ON `transaction_splits` (`transaction_id`);--> statement-breakpoint
CREATE INDEX `transaction_splits_category_idx` ON `transaction_splits` (`category_id`);