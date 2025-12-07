-- CreateTable
CREATE TABLE `AvailableAd` (
    `hash` VARCHAR(191) NOT NULL,
    `imdbId` VARCHAR(191) NOT NULL,
    `filename` VARCHAR(191) NOT NULL,
    `originalFilename` VARCHAR(191) NOT NULL,
    `bytes` BIGINT NOT NULL,
    `originalBytes` BIGINT NOT NULL,
    `host` VARCHAR(191) NOT NULL,
    `progress` INTEGER NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `statusCode` INTEGER NULL,
    `ended` DATETIME(3) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `season` INTEGER NULL,
    `episode` INTEGER NULL,
    `verifiedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `verificationCount` INTEGER NOT NULL DEFAULT 1,

    INDEX `AvailableAd_status_idx`(`status`),
    INDEX `AvailableAd_imdbId_idx`(`imdbId`),
    INDEX `AvailableAd_imdbId_hash_idx`(`imdbId`, `hash`),
    INDEX `AvailableAd_imdbId_status_season_episode_bytes_idx`(`imdbId`, `status`, `season`, `episode`, `bytes`),
    INDEX `AvailableAd_updatedAt_idx`(`updatedAt`),
    PRIMARY KEY (`hash`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AvailableAdFile` (
    `link` VARCHAR(191) NOT NULL,
    `file_id` INTEGER NOT NULL,
    `hash` VARCHAR(191) NOT NULL,
    `path` TEXT NOT NULL,
    `bytes` BIGINT NOT NULL,
    `season` INTEGER NULL,
    `episode` INTEGER NULL,

    INDEX `AvailableAdFile_hash_idx`(`hash`),
    INDEX `AvailableAdFile_hash_season_episode_idx`(`hash`, `season`, `episode`),
    PRIMARY KEY (`link`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
