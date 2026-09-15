-- Stewardship starts with one category group and the system category that
-- unassigned income goes to. Available to Fund is shown as a banner, not a budget row.
INSERT INTO `category_groups` (`id`, `name`, `sort_order`, `created_at`, `updated_at`) VALUES
  ('general', 'General', 0, unixepoch(), unixepoch());
--> statement-breakpoint
INSERT INTO `categories` (`id`, `group_id`, `name`, `kind`, `rollover`, `is_sensitive`, `sort_order`, `created_at`, `updated_at`) VALUES
  ('available-to-fund', 'general', 'Available to Fund', 'availableToFund', 0, 0, 0, unixepoch(), unixepoch());
