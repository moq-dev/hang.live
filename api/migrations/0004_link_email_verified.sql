-- Whether the provider verified the account's email address when the link was last made.
-- Logins never checked before this column, so every existing link starts unverified (0) and vouches
-- again on its next sign-in with a verified address matching the account's.
ALTER TABLE accounts_linked ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0;
