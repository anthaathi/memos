-- memo_folder
CREATE TABLE `memo_folder` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `uid` VARCHAR(256) NOT NULL UNIQUE,
  `creator_id` INT NOT NULL,
  `created_ts` BIGINT NOT NULL DEFAULT (UNIX_TIMESTAMP()),
  `updated_ts` BIGINT NOT NULL DEFAULT (UNIX_TIMESTAMP()),
  `title` VARCHAR(256) NOT NULL,
  `pinned` BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX `idx_memo_folder_creator_id` ON `memo_folder`(`creator_id`);

ALTER TABLE `memo` ADD COLUMN `folder_id` INT NOT NULL DEFAULT 0;

CREATE INDEX `idx_memo_folder_id` ON `memo`(`folder_id`);
