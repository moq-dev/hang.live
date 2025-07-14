-- Create users table
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  avatar TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE accounts_linked(
  account_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  provider_user TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (account_id, provider_id),
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

-- Create indexes for better performance
CREATE INDEX idx_accounts_email ON accounts(email);
CREATE INDEX idx_accounts_linked_provider ON accounts_linked(provider_id, provider_user);
