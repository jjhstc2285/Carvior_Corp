-- 사내 게시판 — 전 직원이 보는 공지.
--
-- 지금은 텔레그램 공지방으로만 돌린다. 방에 들어온 뒤의 글만 보이고, 지난 공지를 찾으려면
-- 올려 가며 뒤져야 한다. 들어오면 보이는 자리에 남겨 둔다.
--
-- 금액은 여기에도 안 적는다 — 전 직원이 보는 자리라는 점은 공지방과 같다.
CREATE TABLE `Notice` (
  `id`        VARCHAR(191) NOT NULL,
  `category`  VARCHAR(10)  NOT NULL DEFAULT '일반',
  `title`     VARCHAR(120) NOT NULL,
  `body`      TEXT         NOT NULL,
  -- 위에 고정. 늘 봐야 하는 글이 아래로 밀리면 아무도 안 본다.
  `pinned`    BOOLEAN      NOT NULL DEFAULT false,
  `authorId`  VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3)  NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `Notice_createdAt_idx` (`createdAt`),
  INDEX `Notice_authorId_idx` (`authorId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Notice` ADD CONSTRAINT `Notice_authorId_fkey`
  FOREIGN KEY (`authorId`) REFERENCES `Employee`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
