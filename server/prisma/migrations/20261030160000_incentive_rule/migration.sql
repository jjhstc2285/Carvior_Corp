-- 알선 딜러 인센티브 규칙을 관리자가 고친다.
--
-- 요율과 구간은 장사 사정에 따라 바뀐다. 코드에 박아 두면 바꿀 때마다 배포를 해야 하고,
-- 그 사이에는 종이에 적힌 표와 화면이 다른 말을 한다.
--
-- 적용 시작일로 갈라 쌓는다. 한 줄만 두고 고치면 지난 달 급여가 새 요율로 다시 계산된다.
CREATE TABLE `IncentiveRule` (
  `id` VARCHAR(191) NOT NULL,
  `effectiveFrom` DATE NOT NULL,
  `baseSalaryDefault` INTEGER NOT NULL DEFAULT 2000000,
  `floor` INTEGER NOT NULL DEFAULT 2000000,
  `tiers` JSON NOT NULL,
  `tenure` JSON NOT NULL,
  `leaderBaseSalary` INTEGER NOT NULL DEFAULT 2200000,
  `leaderDefaultRate` DOUBLE NOT NULL DEFAULT 0.03,
  `leaderTargetRate` DOUBLE NOT NULL DEFAULT 0.05,
  `leaderMinPersonalSales` INTEGER NOT NULL DEFAULT 3000000,
  `updatedBy` VARCHAR(30) NOT NULL DEFAULT '',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `IncentiveRule_effectiveFrom_key`(`effectiveFrom`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 지금 코드에 박혀 있던 표를 그대로 첫 줄로 넣는다.
-- 안 넣어 두면 화면에서 처음 열었을 때 규칙이 비어 보인다.
INSERT INTO `IncentiveRule`
  (`id`, `effectiveFrom`, `baseSalaryDefault`, `floor`, `tiers`, `tenure`,
   `leaderBaseSalary`, `leaderDefaultRate`, `leaderTargetRate`, `leaderMinPersonalSales`,
   `updatedBy`, `createdAt`, `updatedAt`)
VALUES (
  'incentive-rule-2026-10',
  '2026-10-01',
  2000000,
  2000000,
  '[{"tier":"1구간","from":2000000,"rate":0.2},{"tier":"2구간","from":4000000,"rate":0.25},{"tier":"3구간","from":5000000,"rate":0.3},{"tier":"4구간","from":6000000,"rate":0.35},{"tier":"5구간","from":7000000,"rate":0.4},{"tier":"6구간","from":8000000,"rate":0.45},{"tier":"7구간","from":10000000,"rate":0.5},{"tier":"8구간(폭발)","from":15000000,"rate":0.55}]',
  '[2000000,2200000,2400000,2600000,2800000,3000000]',
  2200000, 0.03, 0.05, 3000000,
  '처음 값', NOW(3), NOW(3)
);
