-- A placeholder for the church's legal name on giving statements; the Treasurer fills in
-- the real one and the rest. (Existing databases have already run this and keep what they have.)
INSERT INTO `statement_settings` (`id`, `legal_name`, `updated_at`) VALUES
  ('church', 'Your church’s legal name', unixepoch());
