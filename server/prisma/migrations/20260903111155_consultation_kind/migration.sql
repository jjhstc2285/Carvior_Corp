-- 상담을 알선/수출로 나눈다. 지금까지 쌓인 건 전부 알선이라 기본값이 곧 정답이다.
ALTER TABLE `Consultation`
  ADD COLUMN `kind` ENUM('BROKERAGE', 'EXPORT') NOT NULL DEFAULT 'BROKERAGE';

CREATE INDEX `Consultation_kind_date_idx` ON `Consultation`(`kind`, `date`);
