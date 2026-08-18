-- memo_folder
CREATE TABLE memo_folder (
  id SERIAL PRIMARY KEY,
  uid TEXT NOT NULL UNIQUE,
  creator_id INTEGER NOT NULL,
  created_ts BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
  updated_ts BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW()),
  title TEXT NOT NULL,
  pinned BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_memo_folder_creator_id ON memo_folder(creator_id);

ALTER TABLE memo ADD COLUMN folder_id INTEGER NOT NULL DEFAULT 0;

CREATE INDEX idx_memo_folder_id ON memo(folder_id);
