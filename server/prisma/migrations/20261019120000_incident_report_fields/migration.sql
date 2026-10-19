-- 시말서를 회사 종이 양식대로 받는다.
--
-- 양식에는 네 꼭지(사건 및 경위 / 발생 원인 및 사유 / 조치 사항 / 재발 방지 대책)와
-- 발생 일시·장소가 있는데, 한 칸에 몰아 적게 해 두었더니 적는 사람마다 꼭지를 빼먹거나
-- 순서가 달라져서 뽑아 놓으면 종이 양식과 다른 문서가 됐다.
--
-- '사건 및 경위'는 content 를 그대로 쓴다 — 이미 적힌 시말서를 옮겨 적게 하지 않는다.
-- 발생 시각은 글자로 둔다("오후 3시쯤"처럼 적어 온다).
ALTER TABLE `ApprovalDocument`
  ADD COLUMN `occurredOn`    DATE         NULL,
  ADD COLUMN `occurredTime`  VARCHAR(30)  NOT NULL DEFAULT '',
  ADD COLUMN `occurredPlace` VARCHAR(60)  NOT NULL DEFAULT '',
  ADD COLUMN `cause`         TEXT         NOT NULL,
  ADD COLUMN `action`        TEXT         NOT NULL,
  ADD COLUMN `prevention`    TEXT         NOT NULL;
