-- Add season and episode columns to both Available and AvailableFile tables
ALTER TABLE `Available` ADD COLUMN `season` INT NULL;
ALTER TABLE `Available` ADD COLUMN `episode` INT NULL;

ALTER TABLE `AvailableFile` ADD COLUMN `season` INT NULL;
ALTER TABLE `AvailableFile` ADD COLUMN `episode` INT NULL;

-- Create composite indexes for efficient queries
CREATE INDEX `Available_imdbId_status_season_episode_bytes_idx` ON `Available`(`imdbId`, `status`, `season`, `episode`, `bytes`);
CREATE INDEX `AvailableFile_hash_season_episode_idx` ON `AvailableFile`(`hash`, `season`, `episode`);
