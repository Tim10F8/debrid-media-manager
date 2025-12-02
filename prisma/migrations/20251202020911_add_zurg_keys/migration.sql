-- CreateTable
CREATE TABLE `ZurgKeys` (
    `apiKey` VARCHAR(191) NOT NULL,
    `validUntil` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ZurgKeys_validUntil_idx`(`validUntil`),
    PRIMARY KEY (`apiKey`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
