-- CreateTable
CREATE TABLE `MdblistCache` (
    `id` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `data` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `MdblistCache_type_idx`(`type`),
    INDEX `MdblistCache_updatedAt_idx`(`updatedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;