-- memo_folder
CREATE TABLE memo_folder (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uid TEXT NOT NULL UNIQUE,
  creator_id INTEGER NOT NULL,
  created_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_ts BIGINT NOT NULL DEFAULT (strftime('%s', 'now')),
  title TEXT NOT NULL,
  pinned INTEGER NOT NULL CHECK (pinned IN (0, 1)) DEFAULT 0
);

CREATE INDEX idx_memo_folder_creator_id ON memo_folder(creator_id);

ALTER TABLE memo ADD COLUMN folder_id INTEGER NOT NULL DEFAULT 0;

CREATE INDEX idx_memo_folder_id ON memo(folder_id);
