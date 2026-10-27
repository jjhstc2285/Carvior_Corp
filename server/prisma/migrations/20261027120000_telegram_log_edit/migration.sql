-- 입금방 쪽지를 손으로 올리고 고친다.
--
-- messageId: 방에 뜬 줄 번호. 틀린 값을 다시 올리면 같은 차가 두 줄이 되어, 읽는 사람이
--            어느 쪽이 맞는지를 시각으로 가려야 한다 — 그 방을 보고 입금을 넣는다.
-- sentBy   : 올린 사람. 숫자를 물어볼 자리다.
-- editedAt : 고친 때. 안 적어 두면 줄이 말없이 바뀐다.
ALTER TABLE `TelegramLog`
  ADD COLUMN `messageId` VARCHAR(30) NOT NULL DEFAULT '',
  ADD COLUMN `sentBy` VARCHAR(40) NOT NULL DEFAULT '',
  ADD COLUMN `editedAt` DATETIME(3) NULL;
