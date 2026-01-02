-- AlterTable: Add hideCastOption to CastProfile
-- This is a safe, non-breaking change:
-- - Adding a new column with a default value
-- - Existing rows will automatically get the default value (false)
-- - No data is modified or deleted

ALTER TABLE `CastProfile` ADD COLUMN `hideCastOption` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: Add hideCastOption to TorBoxCastProfile
ALTER TABLE `TorBoxCastProfile` ADD COLUMN `hideCastOption` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: Add hideCastOption to AllDebridCastProfile
ALTER TABLE `AllDebridCastProfile` ADD COLUMN `hideCastOption` BOOLEAN NOT NULL DEFAULT false;
