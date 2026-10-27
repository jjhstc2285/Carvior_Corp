-- 고쳐도 방에 뜬 줄을 안 고친다 — 여덟 줄을 통째로 다시 올린다.
--
-- 조용히 고치면 알림이 안 울려서, 그새 읽고 간 사람은 옛 숫자를 들고 있게 된다.
-- 그 방을 보고 입금을 넣는 자리라 바뀐 걸 모르는 쪽이 더 나쁘다.
--
-- 그래서 쪽지 번호(messageId)도, 고친 때(editedAt)도 쓸 데가 없어졌다. 다시 올린
-- 쪽지는 그 자체로 새 줄이고, 몇 번째인지는 차량번호로 세면 된다.
ALTER TABLE `TelegramLog`
  DROP COLUMN `messageId`,
  DROP COLUMN `editedAt`;
