-- Whether the provider verified the account's email address when the link was last made.
-- Before this column, logins never checked, so legacy links are unverified (0), except Google and
-- Apple, which both verify an account's email address before it can sign in.
ALTER TABLE accounts_linked ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0;
UPDATE accounts_linked SET email_verified = 1 WHERE provider_id IN ('google', 'apple');
