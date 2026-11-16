-- 상사(테넌트) 뿌리.
--
-- 애니원모터스 한 곳 전용으로 만든 시스템을 여러 상사가 쓰게 만드는 첫 걸음이다.
-- 지금 DB에 있는 데이터는 전부 애니원 것이라, 모든 직원을 1번 상사로 채운다 —
-- 그래서 이 마이그레이션은 데이터를 잃지 않고, 되돌릴 일도 거의 없다.
--
-- ⚠ 여기까지는 "뿌리"일 뿐이다. 나머지 56개 모델에는 상사 구분이 없어서, 두 번째
-- 상사를 올리면 출퇴근·정산·상담이 전부 섞여 보인다. Tenant 테이블에 1번만 두고
-- 모델별 스코핑을 끝낸 다음에 상사를 늘릴 것.

CREATE TABLE `Tenant` (
  `id`        INTEGER      NOT NULL AUTO_INCREMENT,
  `code`      VARCHAR(40)  NOT NULL,
  `name`      VARCHAR(80)  NOT NULL,
  `modules`   TEXT         NOT NULL,
  `active`    BOOLEAN      NOT NULL DEFAULT true,
  `createdAt` DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `Tenant_code_key`(`code`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 1번은 애니원모터스. code는 carvior의 발주사 코드(booking.source)와 같은 값이어야 한다 —
-- 검차 주문이 그 값으로 나가고, 거기서 어긋나면 주문이 "미등록 발주사"로 떨어진다.
INSERT INTO `Tenant` (`id`, `code`, `name`, `modules`) VALUES (
  1,
  'anyone-motors',
  '애니원모터스',
  'home,notice,attendance,workLog,approval,consultation,settlement,parking,vehicle,ad,purchaseIntake,stockFinance,dealerFee,vendor,property,payroll,cleaning,condolence,adminSheet,telegramSale,monitoring,chat'
);

-- 기존 직원은 전부 애니원 소속이다
ALTER TABLE `Employee` ADD COLUMN `tenantId` INTEGER NOT NULL DEFAULT 1;

CREATE INDEX `Employee_tenantId_idx` ON `Employee`(`tenantId`);

ALTER TABLE `Employee`
  ADD CONSTRAINT `Employee_tenantId_fkey`
  FOREIGN KEY (`tenantId`) REFERENCES `Tenant`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;
