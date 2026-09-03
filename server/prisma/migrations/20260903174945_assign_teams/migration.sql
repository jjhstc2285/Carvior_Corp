-- 팀 배정. 이름으로 맞춘다 — 동명이인이 생기면 여기서 걸러야 한다.
-- 이미 팀이 정해진 사람은 건드리지 않는다.
UPDATE `Employee` SET `department` = '광고팀'
  WHERE `name` IN ('이태희', '이근석') AND (`department` IS NULL OR `department` = '');

UPDATE `Employee` SET `department` = '매입팀'
  WHERE `name` IN ('박예나', '이금미') AND (`department` IS NULL OR `department` = '');

UPDATE `Employee` SET `department` = '차량관리팀'
  WHERE `name` IN ('이규동', '윤기정') AND (`department` IS NULL OR `department` = '');

UPDATE `Employee` SET `department` = '알선팀'
  WHERE `name` IN ('안동주', '김영우', '안가은') AND (`department` IS NULL OR `department` = '');
