-- 그 달 그 사람 식대를 손으로 고친다.
--
-- 식대는 근태에서 내는데, 찍고 나가서 밖에서 먹은 날이나 찍는 걸 잊은 날처럼 찍힌 것과
-- 먹은 것이 안 맞는 달이 있다. 고친 값이 있으면 그걸 쓰고, 없으면 근태로 낸 값을 쓴다.
CREATE TABLE `PayrollMeal` (
  `id` VARCHAR(191) NOT NULL,
  `month` VARCHAR(7) NOT NULL,
  `name` VARCHAR(30) NOT NULL,
  `amount` INTEGER NOT NULL DEFAULT 0,
  `updatedBy` VARCHAR(30) NOT NULL DEFAULT '',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `PayrollMeal_month_name_key`(`month`, `name`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
