-- 구글 시트에서 옮겨온 상담의 원래 번호. 두 번 넣어도 겹치지 않게 이걸로 가른다.
ALTER TABLE `Consultation`
  ADD COLUMN `sourceId` VARCHAR(30) NULL;

CREATE INDEX `Consultation_sourceId_idx` ON `Consultation`(`sourceId`);
