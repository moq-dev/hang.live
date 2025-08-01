-- Create favorites table
CREATE TABLE favorites (
  account_id TEXT NOT NULL,
  room TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (account_id, room),
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

-- Create indexes for better performance
CREATE INDEX idx_favorites_account ON favorites(account_id);
CREATE INDEX idx_favorites_room ON favorites(room);