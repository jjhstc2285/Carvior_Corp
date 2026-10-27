-- 쪽지 번호를 되돌린다.
--
-- 방에 뜬 줄을 고치려고 들고 있다가, 고칠 때는 통째로 다시 올리기로 해서 내렸었다.
-- 이번에는 지우려고 다시 든다 — 목록에서만 지우면 방에는 그 쪽지가 그대로 남는데,
-- 지우는 까닭이 그 방을 보는 사람이 틀린 숫자로 입금을 넣지 않게 하려는 것이다.
ALTER TABLE `TelegramLog` ADD COLUMN `messageId` VARCHAR(30) NOT NULL DEFAULT '';
