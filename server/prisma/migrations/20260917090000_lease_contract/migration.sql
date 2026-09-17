-- 부동산 임대차·전대차 계약서. 부동산 한 자리에 여러 장이 붙는다(갱신할 때마다 새로 쓴다).
-- 주민등록번호·법인등록번호는 일부러 안 담는다 — 인쇄물에 손으로 적는다.
CREATE TABLE `LeaseContract` (
  `id` VARCHAR(191) NOT NULL,
  `propertyId` VARCHAR(191) NOT NULL,
  `kind` VARCHAR(10) NOT NULL DEFAULT '전대차',
  `rentType` VARCHAR(10) NOT NULL DEFAULT '월세',

  `address` VARCHAR(191) NOT NULL DEFAULT '',
  `landCategory` VARCHAR(30) NOT NULL DEFAULT '',
  `landArea` VARCHAR(30) NOT NULL DEFAULT '',
  `buildingStructure` VARCHAR(60) NOT NULL DEFAULT '',
  `buildingArea` VARCHAR(30) NOT NULL DEFAULT '',
  `leasedPart` VARCHAR(60) NOT NULL DEFAULT '',
  `leasedArea` VARCHAR(30) NOT NULL DEFAULT '',

  `deposit` INTEGER NOT NULL DEFAULT 0,
  `downPayment` INTEGER NOT NULL DEFAULT 0,
  `interimPayment` INTEGER NOT NULL DEFAULT 0,
  `interimOn` DATE NULL,
  `balance` INTEGER NOT NULL DEFAULT 0,
  `balanceOn` DATE NULL,
  `monthlyRent` INTEGER NOT NULL DEFAULT 0,
  `payDay` INTEGER NOT NULL DEFAULT 0,

  `handoverOn` DATE NULL,
  `startOn` DATE NULL,
  `endOn` DATE NULL,

  `brokerageRate` VARCHAR(10) NOT NULL DEFAULT '',
  `special` TEXT NOT NULL,
  `writtenOn` DATE NULL,

  `lessorName` VARCHAR(30) NOT NULL DEFAULT '',
  `lessorAddress` VARCHAR(191) NOT NULL DEFAULT '',
  `lessorPhone` VARCHAR(30) NOT NULL DEFAULT '',
  `lessorAgent` VARCHAR(30) NOT NULL DEFAULT '',
  `lessorAgentPhone` VARCHAR(30) NOT NULL DEFAULT '',

  `lesseeName` VARCHAR(30) NOT NULL DEFAULT '',
  `lesseeAddress` VARCHAR(191) NOT NULL DEFAULT '',
  `lesseePhone` VARCHAR(30) NOT NULL DEFAULT '',
  `lesseeAgent` VARCHAR(30) NOT NULL DEFAULT '',
  `lesseeAgentPhone` VARCHAR(30) NOT NULL DEFAULT '',

  `brokerOffice` VARCHAR(60) NOT NULL DEFAULT '',
  `brokerAddress` VARCHAR(191) NOT NULL DEFAULT '',
  `brokerName` VARCHAR(30) NOT NULL DEFAULT '',
  `brokerRegNo` VARCHAR(30) NOT NULL DEFAULT '',
  `brokerPhone` VARCHAR(30) NOT NULL DEFAULT '',

  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `LeaseContract_propertyId_idx`(`propertyId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
