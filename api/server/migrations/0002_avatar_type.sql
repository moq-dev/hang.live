-- Adds an avatar type column to the accounts table
-- The type can be either "url" or "r2"
ALTER TABLE accounts ADD COLUMN avatar_type TEXT NOT NULL DEFAULT 'url' CHECK (avatar_type IN ('url', 'r2'));
