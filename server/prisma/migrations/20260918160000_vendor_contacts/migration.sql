-- 거래처에 주소와 담당자들.
--
-- 한 곳에 사람이 여럿이다 — 네바퀴 성능장만 해도 메인팀장·하부세척·픽업 담당이 따로다.
-- 번호 칸을 늘리는 대신 사람을 붙인다. 누구에게 무슨 일로 거는지가 이름에 적힌다.
ALTER TABLE `Vendor` ADD COLUMN `address` VARCHAR(255) NOT NULL DEFAULT '';

CREATE TABLE `VendorContact` (
  `id`        VARCHAR(191) NOT NULL,
  `vendorId`  VARCHAR(191) NOT NULL,
  `name`      VARCHAR(40)  NOT NULL DEFAULT '',
  `phone`     VARCHAR(30)  NOT NULL DEFAULT '',
  `sort`      INTEGER      NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3)  NOT NULL,

  INDEX `VendorContact_vendorId_idx`(`vendorId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `VendorContact`
  ADD CONSTRAINT `VendorContact_vendorId_fkey` FOREIGN KEY (`vendorId`) REFERENCES `Vendor`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- 거래처 대장 — 받은 시트를 그대로 옮긴다.
--
-- 담당자가 여럿인 곳은 VendorContact 로 붙인다(네바퀴 성능장은 여덟 명이다).
-- 두 번 돌려도 같도록 id 를 박고 INSERT IGNORE 로 넣는다.

INSERT IGNORE INTO `Vendor` (`id`,`category`,`name`,`phone`,`phone2`,`manager`,`address`,`memo`,`active`,`createdAt`,`updatedAt`) VALUES ('seed_vendor_01','기타','블랙모터스','010-2653-9693','','왕건','경기도 수원시 권선구 평동로 88','평일 오전 9시부터 오후 6시까지 (주말 휴무)',1,NOW(3),NOW(3));
INSERT IGNORE INTO `Vendor` (`id`,`category`,`name`,`phone`,`phone2`,`manager`,`address`,`memo`,`active`,`createdAt`,`updatedAt`) VALUES ('seed_vendor_02','기타','지니카','031-296-4988','','팩스번호','수원시 권선구 매송고색로 853(평동 54-4) 차담 자동차유리 뒤','',1,NOW(3),NOW(3));
INSERT IGNORE INTO `VendorContact` (`id`,`vendorId`,`name`,`phone`,`sort`,`createdAt`,`updatedAt`) VALUES ('seed_vendor_02_c01','seed_vendor_02','채민기 대표님','010-5672-4988',1,NOW(3),NOW(3));
INSERT IGNORE INTO `VendorContact` (`id`,`vendorId`,`name`,`phone`,`sort`,`createdAt`,`updatedAt`) VALUES ('seed_vendor_02_c02','seed_vendor_02','김형섭 팀장님','010-8610-9585',2,NOW(3),NOW(3));
INSERT IGNORE INTO `Vendor` (`id`,`category`,`name`,`phone`,`phone2`,`manager`,`address`,`memo`,`active`,`createdAt`,`updatedAt`) VALUES ('seed_vendor_03','공업사','임광모터스','010-4149-1627','','임무광','경기도 수원시 권선구 평동 31-10','월~금 오전 9시 ~ 오후 10시 / 토요일 오전 9시 ~ 오후 3~4시 / 일요일 휴무',1,NOW(3),NOW(3));
INSERT IGNORE INTO `Vendor` (`id`,`category`,`name`,`phone`,`phone2`,`manager`,`address`,`memo`,`active`,`createdAt`,`updatedAt`) VALUES ('seed_vendor_04','판금·덴트','용덴트','010-2011-4444','','강승래','경기도 수원시 권선구 평동로 90번길 44-5(B동)','월~금 08:30 - 19:30 / 토 08:30 - 16:00 / 정기휴무 (매주 일요일) / - 일요일은 예약시 작업 가능합니다',1,NOW(3),NOW(3));
INSERT IGNORE INTO `Vendor` (`id`,`category`,`name`,`phone`,`phone2`,`manager`,`address`,`memo`,`active`,`createdAt`,`updatedAt`) VALUES ('seed_vendor_05','휠복원','케이플렉스 출장 휠복원','010-7990-9615','','임태식 실장님','서울 강남구 헌릉로 745길 25, 강남자동차매매단지 217호','월~금 평일:오전 7시~ 오후 7시',1,NOW(3),NOW(3));
INSERT IGNORE INTO `Vendor` (`id`,`category`,`name`,`phone`,`phone2`,`manager`,`address`,`memo`,`active`,`createdAt`,`updatedAt`) VALUES ('seed_vendor_06','휠복원','성원2TW휠복원','010-8392-8865','','남윤환 이사님','본점: 경기도 수원시 권선구 평동 21-187','오전8시~새벽3시 까지',1,NOW(3),NOW(3));
INSERT IGNORE INTO `Vendor` (`id`,`category`,`name`,`phone`,`phone2`,`manager`,`address`,`memo`,`active`,`createdAt`,`updatedAt`) VALUES ('seed_vendor_07','광택·세차','럭키 광집','010-7776-7660','','이재민 대표님','평동로 76번길22-23','오전7시~오후5시까지(평일) / 주말 휴무',1,NOW(3),NOW(3));
INSERT IGNORE INTO `VendorContact` (`id`,`vendorId`,`name`,`phone`,`sort`,`createdAt`,`updatedAt`) VALUES ('seed_vendor_07_c01','seed_vendor_07','박주호 부장님','010-3488-3627',1,NOW(3),NOW(3));
INSERT IGNORE INTO `Vendor` (`id`,`category`,`name`,`phone`,`phone2`,`manager`,`address`,`memo`,`active`,`createdAt`,`updatedAt`) VALUES ('seed_vendor_08','성능','KS성능장','031-296-6444','','사무실 연락처','수원시 권선구 평동 61-3(세화로 55)','4개 이상 판할 때',1,NOW(3),NOW(3));
INSERT IGNORE INTO `VendorContact` (`id`,`vendorId`,`name`,`phone`,`sort`,`createdAt`,`updatedAt`) VALUES ('seed_vendor_08_c01','seed_vendor_08','이현호 팀장님','010-2270-4839',1,NOW(3),NOW(3));
INSERT IGNORE INTO `VendorContact` (`id`,`vendorId`,`name`,`phone`,`sort`,`createdAt`,`updatedAt`) VALUES ('seed_vendor_08_c02','seed_vendor_08','이상운 이사님','010-5451-1851',2,NOW(3),NOW(3));
INSERT IGNORE INTO `Vendor` (`id`,`category`,`name`,`phone`,`phone2`,`manager`,`address`,`memo`,`active`,`createdAt`,`updatedAt`) VALUES ('seed_vendor_09','판금·덴트','KS판집','010-8736-9775','','','','',1,NOW(3),NOW(3));
INSERT IGNORE INTO `Vendor` (`id`,`category`,`name`,`phone`,`phone2`,`manager`,`address`,`memo`,`active`,`createdAt`,`updatedAt`) VALUES ('seed_vendor_10','광택·세차','KS광집','010-4226-7161','','김기용 대표님','경기도 수원시 권선구 평동로 90번길 16','평일 오전 7시 ~ 오후 5시 까지 (빨간날 휴무)',1,NOW(3),NOW(3));
INSERT IGNORE INTO `VendorContact` (`id`,`vendorId`,`name`,`phone`,`sort`,`createdAt`,`updatedAt`) VALUES ('seed_vendor_10_c01','seed_vendor_10','이애현 (대표님 아내분)','010-4228-7161',1,NOW(3),NOW(3));
INSERT IGNORE INTO `Vendor` (`id`,`category`,`name`,`phone`,`phone2`,`manager`,`address`,`memo`,`active`,`createdAt`,`updatedAt`) VALUES ('seed_vendor_11','판금·덴트','네바퀴 판집','010-8383-7874','','김금남 대표님','경기도 수원시 권선구 매송고색로793번길 16(고색동)','빨간날만 휴무 / 오전7시 ~ 오후 6시 30분',1,NOW(3),NOW(3));
INSERT IGNORE INTO `VendorContact` (`id`,`vendorId`,`name`,`phone`,`sort`,`createdAt`,`updatedAt`) VALUES ('seed_vendor_11_c01','seed_vendor_11','신과장님(총괄담당)','010-2453-1930',1,NOW(3),NOW(3));
INSERT IGNORE INTO `VendorContact` (`id`,`vendorId`,`name`,`phone`,`sort`,`createdAt`,`updatedAt`) VALUES ('seed_vendor_11_c02','seed_vendor_11','서과장님(딜리버리)','010-6250-5724',2,NOW(3),NOW(3));
INSERT IGNORE INTO `VendorContact` (`id`,`vendorId`,`name`,`phone`,`sort`,`createdAt`,`updatedAt`) VALUES ('seed_vendor_11_c03','seed_vendor_11','신과장님','010-7100-7285',3,NOW(3),NOW(3));
INSERT IGNORE INTO `VendorContact` (`id`,`vendorId`,`name`,`phone`,`sort`,`createdAt`,`updatedAt`) VALUES ('seed_vendor_11_c04','seed_vendor_11','결제 관련 업무지원(김실장님)','010-7328-1999',4,NOW(3),NOW(3));
INSERT IGNORE INTO `Vendor` (`id`,`category`,`name`,`phone`,`phone2`,`manager`,`address`,`memo`,`active`,`createdAt`,`updatedAt`) VALUES ('seed_vendor_12','성능','네바퀴 성능장','031-297-3997','','사무실 연락처','경기도 수원시 권선구 매송고색로 793번길 16','-영업시간- / 평일 / 09:00 ~ 18:00 / 점심 시간 / 12:00 ~ 13:00 / 주말/공휴일 09:00~12:00 / (주말 공휴일 픽업요청불가)',1,NOW(3),NOW(3));
INSERT IGNORE INTO `VendorContact` (`id`,`vendorId`,`name`,`phone`,`sort`,`createdAt`,`updatedAt`) VALUES ('seed_vendor_12_c01','seed_vendor_12','김재근 부장(메인팀장)','010-2535-9093',1,NOW(3),NOW(3));
INSERT IGNORE INTO `VendorContact` (`id`,`vendorId`,`name`,`phone`,`sort`,`createdAt`,`updatedAt`) VALUES ('seed_vendor_12_c02','seed_vendor_12','박진웅 대리','010-9154-3592',2,NOW(3),NOW(3));
INSERT IGNORE INTO `VendorContact` (`id`,`vendorId`,`name`,`phone`,`sort`,`createdAt`,`updatedAt`) VALUES ('seed_vendor_12_c03','seed_vendor_12','이지성 주임','010-8123-8440',3,NOW(3),NOW(3));
INSERT IGNORE INTO `VendorContact` (`id`,`vendorId`,`name`,`phone`,`sort`,`createdAt`,`updatedAt`) VALUES ('seed_vendor_12_c04','seed_vendor_12','임명후 사원','010-2305-3652',4,NOW(3),NOW(3));
INSERT IGNORE INTO `VendorContact` (`id`,`vendorId`,`name`,`phone`,`sort`,`createdAt`,`updatedAt`) VALUES ('seed_vendor_12_c05','seed_vendor_12','장연택 부장(하부세척 문의)','010-4009-1267',5,NOW(3),NOW(3));
INSERT IGNORE INTO `VendorContact` (`id`,`vendorId`,`name`,`phone`,`sort`,`createdAt`,`updatedAt`) VALUES ('seed_vendor_12_c06','seed_vendor_12','전홍구 대리(차량이동및 픽업문의)','010-2302-2103',6,NOW(3),NOW(3));
INSERT IGNORE INTO `VendorContact` (`id`,`vendorId`,`name`,`phone`,`sort`,`createdAt`,`updatedAt`) VALUES ('seed_vendor_12_c07','seed_vendor_12','박시온 사원','010-9294-2165',7,NOW(3),NOW(3));
INSERT IGNORE INTO `Vendor` (`id`,`category`,`name`,`phone`,`phone2`,`manager`,`address`,`memo`,`active`,`createdAt`,`updatedAt`) VALUES ('seed_vendor_13','판금·덴트','평동복원집','010-3150-0063','','','경기 수원시 권선구 평동로 74 1층','',1,NOW(3),NOW(3));
INSERT IGNORE INTO `Vendor` (`id`,`category`,`name`,`phone`,`phone2`,`manager`,`address`,`memo`,`active`,`createdAt`,`updatedAt`) VALUES ('seed_vendor_14','할부사','알페라','010-2207-2023','','김가람','','',1,NOW(3),NOW(3));
INSERT IGNORE INTO `Vendor` (`id`,`category`,`name`,`phone`,`phone2`,`manager`,`address`,`memo`,`active`,`createdAt`,`updatedAt`) VALUES ('seed_vendor_15','보험','메리츠','010-3926-6734','','이미래','','',1,NOW(3),NOW(3));
INSERT IGNORE INTO `Vendor` (`id`,`category`,`name`,`phone`,`phone2`,`manager`,`address`,`memo`,`active`,`createdAt`,`updatedAt`) VALUES ('seed_vendor_16','기타','금강유리','010-9034-8257','','','','',1,NOW(3),NOW(3));
