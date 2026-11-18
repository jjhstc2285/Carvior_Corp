-- 애니원 전용으로 붙어 있던 연동 셋을 뗀다.
--
--  · 플랫폼 매물 점검(adminSheet) — 애니원 구글 시트 ID가 코드에 박혀 있었다.
--    다른 상사가 열면 남의 시트가 뜬다.
--  · 입금방(telegramSale)        — 애니원 텔레그램 입금확인방.
--  · 채널톡                       — 애니원 channel.io 계정. 플러그인 키까지 박혀 있어서
--                                  다른 상사 직원이 문의하면 애니원 상담사에게 갔다.
--
-- 텔레그램 자체는 남긴다. 공지방(notify)은 주차·상담·상품화 일정이 쓰고,
-- 매입방(notifyPurchase)은 매입 관리가 쓴다. 입금방 쪽만 뗐다.
-- TelegramLog 도 남긴다 — 공지방·매입방이 계속 기록을 쌓는다.

-- 채널톡 통화 목록에서 치운 기록. 채널톡이 없으면 가릴 통화도 없다.
DROP TABLE IF EXISTS `DismissedCall`;

-- 상사가 쓰는 모듈 목록에서도 뺀다. 안 빼면 사이드바가 없는 화면을 가리킨다.
UPDATE `Tenant`
SET `modules` = TRIM(BOTH ',' FROM REPLACE(REPLACE(REPLACE(
      CONCAT(',', `modules`, ','),
      ',adminSheet,', ','),
      ',telegramSale,', ','),
      ',,', ','))
WHERE `modules` LIKE '%adminSheet%' OR `modules` LIKE '%telegramSale%';
