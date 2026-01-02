-- CreateTable
CREATE TABLE `ScrapedMusic` (
    `key` VARCHAR(191) NOT NULL,
    `value` JSON NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ScrapedMusic_updatedAt_idx`(`updatedAt`),
    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MusicMetadata` (
    `mbid` VARCHAR(36) NOT NULL,
    `artistMbid` VARCHAR(36) NULL,
    `artist` VARCHAR(500) NOT NULL,
    `album` VARCHAR(500) NOT NULL,
    `year` INTEGER NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `MusicMetadata_artist_idx`(`artist`),
    INDEX `MusicMetadata_year_idx`(`year`),
    FULLTEXT INDEX `MusicMetadata_artist_album_idx`(`artist`, `album`),
    PRIMARY KEY (`mbid`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
