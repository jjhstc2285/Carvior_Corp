-- 텔레그램으로 내보낸 것을 남긴다.
--
-- 지금은 보냈는지가 서버 로그에만 남는다. PM2 안에 있어서 사람이 못 보고 며칠 지나면
-- 밀려 사라진다 — "그 차 올라갔나?"를 방을 뒤져서 확인해야 했다.
--
-- 못 보낸 것도 남긴다. 안 간 걸 모르는 게 제일 나쁘다.
CREATE TABLE `TelegramLog` (
  `id`            VARCHAR(191) NOT NULL,
  `room`          ENUM('BROADCAST', 'SALE', 'PURCHASE') NOT NULL,
  `chatId`        VARCHAR(40)  NOT NULL DEFAULT '',
  `text`          TEXT         NOT NULL,
  `ok`            BOOLEAN      NOT NULL DEFAULT false,
  `reason`        VARCHAR(300) NOT NULL DEFAULT '',
  `vehicleNumber` VARCHAR(30)  NOT NULL DEFAULT '',
  `createdAt`     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `TelegramLog_room_createdAt_idx`(`room`, `createdAt`),
  INDEX `TelegramLog_vehicleNumber_idx`(`vehicleNumber`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
