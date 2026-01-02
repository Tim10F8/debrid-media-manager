-- CreateTable: TorrentioCheckResult (individual check results, kept last 50)
CREATE TABLE `TorrentioCheckResult` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `ok` BOOLEAN NOT NULL,
    `latencyMs` DOUBLE NULL,
    `error` TEXT NULL,
    `urls` JSON NOT NULL DEFAULT ('[]'),
    `checkedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TorrentioCheckResult_checkedAt_idx`(`checkedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
