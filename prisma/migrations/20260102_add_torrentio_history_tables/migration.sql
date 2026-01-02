-- CreateTable: TorrentioHealthHourly (hourly snapshots, 7-day retention)
CREATE TABLE `TorrentioHealthHourly` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `hour` DATETIME(3) NOT NULL,
    `successCount` INTEGER NOT NULL DEFAULT 0,
    `totalCount` INTEGER NOT NULL DEFAULT 0,
    `successRate` DOUBLE NOT NULL DEFAULT 0,
    `avgLatencyMs` DOUBLE NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TorrentioHealthHourly_hour_idx`(`hour`),
    UNIQUE INDEX `TorrentioHealthHourly_hour_key`(`hour`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: TorrentioHealthDaily (daily aggregates, 90-day retention)
CREATE TABLE `TorrentioHealthDaily` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `date` DATETIME(3) NOT NULL,
    `avgSuccessRate` DOUBLE NOT NULL,
    `minSuccessRate` DOUBLE NOT NULL,
    `maxSuccessRate` DOUBLE NOT NULL,
    `avgLatencyMs` DOUBLE NULL,
    `checksCount` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TorrentioHealthDaily_date_idx`(`date`),
    UNIQUE INDEX `TorrentioHealthDaily_date_key`(`date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
