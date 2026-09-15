-- 거래처 대장. 광택집·판금집·공업사·배터리·할부사처럼 전화할 일이 있는 곳을 한곳에 모은다.
CREATE TABLE `Vendor` (
  `id` VARCHAR(191) NOT NULL,
  `category` VARCHAR(20) NOT NULL,
  `name` VARCHAR(60) NOT NULL,
  `phone` VARCHAR(30) NOT NULL DEFAULT '',
  `phone2` VARCHAR(30) NOT NULL DEFAULT '',
  `manager` VARCHAR(30) NOT NULL DEFAULT '',
  `memo` VARCHAR(255) NOT NULL DEFAULT '',
  `active` BOOLEAN NOT NULL DEFAULT true,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  INDEX `Vendor_category_idx`(`category`),
  INDEX `Vendor_name_idx`(`name`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 지금까지 카톡으로 주고받던 상품화 업체를 먼저 넣어둔다.
-- ks판집과 yw광택은 번호가 같다 — 한 분이 두 가지를 하신다.
INSERT INTO `Vendor` (`id`, `category`, `name`, `phone`, `memo`, `updatedAt`) VALUES
  ('seed_vendor_ks_dent',   '판금·덴트',  'ks판집',        '010-8736-9775', 'yw광택과 같은 번호', NOW(3)),
  ('seed_vendor_yw_polish', '광택·세차',  'yw광택',        '010-8736-9775', 'ks판집과 같은 번호', NOW(3)),
  ('seed_vendor_ks_polish', '광택·세차',  'ks광집',        '010-4226-7161', '', NOW(3)),
  ('seed_vendor_sblue',     '성능',       '에스블루성능장', '010-5451-1851', '', NOW(3)),
  ('seed_vendor_daesan',    '판금·덴트',  '대산판집',      '010-4879-9772', '', NOW(3));
