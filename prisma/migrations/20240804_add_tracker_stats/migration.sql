-- CreateTable
CREATE TABLE `TrackerStats` (
    `hash` VARCHAR(191) NOT NULL,
    `seeders` INTEGER NOT NULL DEFAULT 0,
    `leechers` INTEGER NOT NULL DEFAULT 0,
    `downloads` INTEGER NOT NULL DEFAULT 0,
    `successfulTrackers` INTEGER NOT NULL DEFAULT 0,
    `totalTrackers` INTEGER NOT NULL DEFAULT 0,
    `lastChecked` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TrackerStats_lastChecked_idx`(`lastChecked`),
    PRIMARY KEY (`hash`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;