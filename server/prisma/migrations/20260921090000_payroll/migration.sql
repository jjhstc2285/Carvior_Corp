-- 인건비.
--
-- 누가 얼마를 받는지는 회사에서 제일 민감한 값이라 보는 사람을 좁히고 번호로 한 번 더
-- 잠근다. 실 이체액은 저장하지 않는다 — 급여에서 공제를 빼고 식대를 더하면 나오는 값이라,
-- 저장해 두면 금액을 고쳤을 때 둘이 어긋난다.
CREATE TABLE `PayrollEntry` (
  `id`               VARCHAR(191) NOT NULL,
  `name`             VARCHAR(30)  NOT NULL,
  `position`         VARCHAR(20)  NOT NULL DEFAULT '',
  `monthlyPay`       INTEGER      NOT NULL DEFAULT 0,
  `companyDeduction` INTEGER      NOT NULL DEFAULT 0,
  `selfDeduction`    INTEGER      NOT NULL DEFAULT 0,
  `mealAllowance`    INTEGER      NOT NULL DEFAULT 0,
  `burden`           VARCHAR(30)  NOT NULL DEFAULT '',
  `memo`             VARCHAR(255) NOT NULL DEFAULT '',
  `active`           BOOLEAN      NOT NULL DEFAULT true,
  `createdAt`        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt`        DATETIME(3)  NOT NULL,

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
