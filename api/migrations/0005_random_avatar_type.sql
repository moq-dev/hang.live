-- Accounts created without a provider avatar stored an app-relative random avatar
-- (/avatar/N.svg) as an R2 key, which produced broken R2 URLs.
UPDATE accounts SET avatar_type = 'url' WHERE avatar_type = 'r2' AND avatar LIKE '/avatar/%';
