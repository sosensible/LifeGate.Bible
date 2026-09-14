-- The church's canonical ministries, in the order the church lists them.
-- Public content, seeded so every new database starts with them.
INSERT INTO `ministries` (`id`, `slug`, `name`, `description`, `sort_order`, `created_at`, `updated_at`) VALUES
  (lower(hex(randomblob(16))), 'teacher-sunday-school', 'Teacher (Sunday School)', 'Teaching God''s Word to all ages in our Sunday School classes before the worship service.', 0, unixepoch(), unixepoch()),
  (lower(hex(randomblob(16))), 'preaching', 'Preaching', 'Men of the congregation gifted to preach and share God''s Word from the pulpit — a shared calling that reaches beyond the pastor alone.', 1, unixepoch(), unixepoch()),
  (lower(hex(randomblob(16))), 'hospitality', 'Hospitality', 'Welcoming guests and members and fostering warm fellowship whenever the church gathers.', 2, unixepoch(), unixepoch()),
  (lower(hex(randomblob(16))), 'grounds-facilities', 'Grounds & Facilities', 'Caring for our building and grounds so Lifegate remains a place of worship and welcome.', 3, unixepoch(), unixepoch()),
  (lower(hex(randomblob(16))), 'evangelism', 'Evangelism', 'Sharing the Gospel with our community and beyond, reaching the lost with the love of Christ.', 4, unixepoch(), unixepoch()),
  (lower(hex(randomblob(16))), 'dinners', 'Dinners', 'Organizing the seasonal meals where our church family gathers to share food and fellowship.', 5, unixepoch(), unixepoch()),
  (lower(hex(randomblob(16))), 'missions', 'Missions', 'Keeping in touch with our missionaries and keeping the congregation informed and praying for their work.', 6, unixepoch(), unixepoch()),
  (lower(hex(randomblob(16))), 'music', 'Music', 'Leading the congregation in traditional hymns and song to the glory of God.', 7, unixepoch(), unixepoch()),
  (lower(hex(randomblob(16))), 'nursery', 'Nursery', 'Providing loving care for our youngest so parents can worship with peace of mind.', 8, unixepoch(), unixepoch()),
  (lower(hex(randomblob(16))), 'deacons', 'Deacons', 'Serving the practical and benevolent needs of the congregation and supporting the ministry of the church.', 9, unixepoch(), unixepoch()),
  (lower(hex(randomblob(16))), 'elder-board', 'Elder Board', 'Providing spiritual oversight and shepherding leadership for the life and direction of the church.', 10, unixepoch(), unixepoch()),
  (lower(hex(randomblob(16))), 'it-information-technology', 'IT (Information Technology)', 'Maintaining the church website, audio/video, and technology that supports our ministries.', 11, unixepoch(), unixepoch()),
  (lower(hex(randomblob(16))), 'decoration', 'Decoration', 'Preparing and decorating our worship space for services, seasons, and special occasions.', 12, unixepoch(), unixepoch()),
  (lower(hex(randomblob(16))), 'bulletin', 'Bulletin', 'Preparing and publishing the weekly church bulletin to keep the congregation informed.', 13, unixepoch(), unixepoch()),
  (lower(hex(randomblob(16))), 'pastoral', 'Pastoral', 'Shepherding the congregation through pastoral care — visitation, counsel, and support in times of need.', 14, unixepoch(), unixepoch()),
  (lower(hex(randomblob(16))), 'visitation', 'Visitation', 'Caring for the homebound, hospitalized, and those in need through regular visits and prayer.', 15, unixepoch(), unixepoch()),
  (lower(hex(randomblob(16))), 'stewardship', 'Stewardship', 'Overseeing the church''s finances and resources — receiving gifts, paying obligations, and keeping accurate records. The treasurer serves within this ministry.', 16, unixepoch(), unixepoch()),
  (lower(hex(randomblob(16))), 'pastoral-search', 'Pastoral Search', 'Prayerfully seeking the permanent pastor God has for Lifegate — reviewing candidates and guiding the call process.', 17, unixepoch(), unixepoch()),
  (lower(hex(randomblob(16))), 'transportation', 'Transportation', 'Helping members who cannot drive get to services and church gatherings through rides and coordination.', 18, unixepoch(), unixepoch());
