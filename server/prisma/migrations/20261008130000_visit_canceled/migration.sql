-- 방문취소 — 약속은 잡혔는데 손님 쪽에서 안 오기로 한 것.
-- 맡은 딜러는 기다렸을 뿐 손님을 맞은 게 아니라, 방문 배정에서 안 세고 그 시간도 다시 빈다.
-- 종결과는 다르다 — 종결은 상담이 끝난 것이고, 이건 그날 안 온 것뿐이다.
ALTER TABLE `Consultation`
  MODIFY COLUMN `status` ENUM('IN_PROGRESS', 'CONTRACTED', 'SOLD', 'ON_HOLD', 'CLOSED', 'VISIT_CANCELED')
  NOT NULL DEFAULT 'IN_PROGRESS';
