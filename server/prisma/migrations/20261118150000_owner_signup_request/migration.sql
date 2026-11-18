-- 상사 개설 신청.
--
-- 직원 가입(SignupRequest)과 다른 일이다. 직원은 이미 열려 있는 상사에 들어오지만,
-- 여기는 상사 자체가 아직 없다. 신청을 받아 두기만 하고 Tenant 는 만들지 않는다 —
-- 56개 모델에 상사 구분이 없어서 두 번째 상사가 생기면 데이터가 섞인다.
-- 스코핑이 끝나기 전까지는 사람이 확인하고 손으로 연다.

CREATE TABLE `OwnerSignupRequest` (
  `id`         VARCHAR(191) NOT NULL,
  `shopName`   VARCHAR(80)  NOT NULL,
  `ownerName`  VARCHAR(30)  NOT NULL,
  `phone`      VARCHAR(20)  NOT NULL,
  `bizNumber`  VARCHAR(20)  NOT NULL DEFAULT '',
  `email`      VARCHAR(120) NOT NULL DEFAULT '',
  `region`     VARCHAR(40)  NOT NULL DEFAULT '',
  `headcount`  VARCHAR(20)  NOT NULL DEFAULT '',
  `memo`       VARCHAR(500) NOT NULL DEFAULT '',

  `status`     ENUM('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
  `reviewedAt` DATETIME(3)  NULL,
  `reviewNote` VARCHAR(191) NULL,

  `createdAt`  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`  DATETIME(3)  NOT NULL,

  INDEX `OwnerSignupRequest_status_idx`(`status`),
  INDEX `OwnerSignupRequest_phone_idx`(`phone`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
