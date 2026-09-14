-- Every existing account was created by an administrator (sign-up is disabled),
-- so its email is the church's own record. Mark them verified so Better Auth
-- does not delete an account's password the first time it signs in with a
-- magic link. New accounts are created verified (ADMIN_CREATED in server/lib/auth.ts).
UPDATE `user` SET `email_verified` = 1 WHERE `email_verified` = 0;
