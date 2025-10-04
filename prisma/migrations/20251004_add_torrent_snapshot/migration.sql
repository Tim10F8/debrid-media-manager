-- CreateTable
CREATE TABLE `TorrentSnapshot` (
    `id` VARCHAR(191) NOT NULL,
    `hash` VARCHAR(191) NOT NULL,
    `addedDate` DATETIME(3) NOT NULL,
    `payload` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `TorrentSnapshot_hash_idx`(`hash`),
    INDEX `TorrentSnapshot_hash_addedDate_idx`(`hash`, `addedDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

