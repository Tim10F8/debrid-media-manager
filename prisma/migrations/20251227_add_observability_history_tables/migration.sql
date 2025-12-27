-- CreateTable: RdOperationalEvent (raw events for aggregation)
CREATE TABLE `RdOperationalEvent` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `operation` VARCHAR(191) NOT NULL,
    `status` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `RdOperationalEvent_operation_idx`(`operation`),
    INDEX `RdOperationalEvent_createdAt_idx`(`createdAt`),
    INDEX `RdOperationalEvent_operation_status_idx`(`operation`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: StreamServerHealth (latest health per server)
CREATE TABLE `StreamServerHealth` (
    `host` VARCHAR(191) NOT NULL,
    `status` INTEGER NULL,
    `latencyMs` DOUBLE NULL,
    `ok` BOOLEAN NOT NULL DEFAULT false,
    `error` TEXT NULL,
    `checkedAt` DATETIME(3) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `StreamServerHealth_ok_idx`(`ok`),
    INDEX `StreamServerHealth_latencyMs_idx`(`latencyMs`),
    INDEX `StreamServerHealth_checkedAt_idx`(`checkedAt`),
    PRIMARY KEY (`host`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: RdOperationalHourly (hourly aggregates, 7-day retention)
CREATE TABLE `RdOperationalHourly` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `hour` DATETIME(3) NOT NULL,
    `operation` VARCHAR(191) NOT NULL,
    `totalCount` INTEGER NOT NULL,
    `successCount` INTEGER NOT NULL,
    `failureCount` INTEGER NOT NULL,
    `otherCount` INTEGER NOT NULL DEFAULT 0,
    `successRate` DOUBLE NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `RdOperationalHourly_hour_idx`(`hour`),
    INDEX `RdOperationalHourly_operation_hour_idx`(`operation`, `hour`),
    UNIQUE INDEX `RdOperationalHourly_hour_operation_key`(`hour`, `operation`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: RdOperationalDaily (daily aggregates, 90-day retention)
CREATE TABLE `RdOperationalDaily` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `date` DATETIME(3) NOT NULL,
    `operation` VARCHAR(191) NOT NULL,
    `totalCount` INTEGER NOT NULL,
    `successCount` INTEGER NOT NULL,
    `failureCount` INTEGER NOT NULL,
    `avgSuccessRate` DOUBLE NOT NULL,
    `minSuccessRate` DOUBLE NOT NULL,
    `maxSuccessRate` DOUBLE NOT NULL,
    `peakHour` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `RdOperationalDaily_date_idx`(`date`),
    INDEX `RdOperationalDaily_operation_date_idx`(`operation`, `date`),
    UNIQUE INDEX `RdOperationalDaily_date_operation_key`(`date`, `operation`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: StreamHealthHourly (hourly snapshots, 7-day retention)
CREATE TABLE `StreamHealthHourly` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `hour` DATETIME(3) NOT NULL,
    `totalServers` INTEGER NOT NULL,
    `workingServers` INTEGER NOT NULL,
    `workingRate` DOUBLE NOT NULL,
    `avgLatencyMs` DOUBLE NULL,
    `minLatencyMs` DOUBLE NULL,
    `maxLatencyMs` DOUBLE NULL,
    `fastestServer` VARCHAR(191) NULL,
    `checksInHour` INTEGER NOT NULL DEFAULT 1,
    `failedServers` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `StreamHealthHourly_hour_idx`(`hour`),
    UNIQUE INDEX `StreamHealthHourly_hour_key`(`hour`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: StreamHealthDaily (daily aggregates, 90-day retention)
CREATE TABLE `StreamHealthDaily` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `date` DATETIME(3) NOT NULL,
    `avgWorkingRate` DOUBLE NOT NULL,
    `minWorkingRate` DOUBLE NOT NULL,
    `maxWorkingRate` DOUBLE NOT NULL,
    `avgLatencyMs` DOUBLE NULL,
    `checksCount` INTEGER NOT NULL,
    `alwaysWorking` INTEGER NOT NULL DEFAULT 0,
    `neverWorking` INTEGER NOT NULL DEFAULT 0,
    `flaky` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `StreamHealthDaily_date_idx`(`date`),
    UNIQUE INDEX `StreamHealthDaily_date_key`(`date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: ServerReliabilityDaily (per-server daily stats)
CREATE TABLE `ServerReliabilityDaily` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `date` DATETIME(3) NOT NULL,
    `host` VARCHAR(191) NOT NULL,
    `checksCount` INTEGER NOT NULL,
    `successCount` INTEGER NOT NULL,
    `avgLatencyMs` DOUBLE NULL,
    `reliability` DOUBLE NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ServerReliabilityDaily_date_idx`(`date`),
    INDEX `ServerReliabilityDaily_host_idx`(`host`),
    INDEX `ServerReliabilityDaily_reliability_idx`(`reliability`),
    UNIQUE INDEX `ServerReliabilityDaily_date_host_key`(`date`, `host`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
