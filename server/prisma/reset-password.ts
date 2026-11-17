/**
 * 계정 비밀번호 재설정.
 *
 *   npm run reset:password -- anwonyong '새비밀번호'
 *
 * 관리자 화면에는 남의 비밀번호를 초기화하는 기능이 없다(본인만 POST /api/auth/password 로 변경).
 * 비밀번호를 잊었을 때 서버에서 직접 되돌리는 용도다.
 *
 * 임직원 시드(seed.ts)는 기존 계정의 passwordHash를 일부러 건드리지 않으므로
 * 시드를 다시 돌려도 비밀번호는 초기화되지 않는다 — 그때 쓰는 게 이 스크립트다.
 */
// ts-node로 직접 돌리는 스크립트는 .env를 알아서 읽지 않는다 — PrismaClient가
// 만들어지기 전에 먼저 읽어 둔다(없으면 "Environment variable not found: DATABASE_URL").
import 'dotenv/config';

import * as bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const [loginId, password] = process.argv.slice(2);

  if (!loginId || !password) {
    throw new Error("사용법: npm run reset:password -- <아이디> '<새비밀번호>'");
  }
  if (password.length < 8) {
    throw new Error('비밀번호는 8자 이상으로 정해주세요.');
  }

  const employee = await prisma.employee.findUnique({
    where: { loginId },
    select: { id: true, name: true, position: true, role: true, active: true },
  });

  if (!employee) {
    const others = await prisma.employee.findMany({
      where: { loginId: { not: null } },
      select: { loginId: true },
      orderBy: { createdAt: 'asc' },
    });
    throw new Error(
      `"${loginId}" 계정을 찾을 수 없습니다.\n` +
        `        쓸 수 있는 아이디: ${others.map((o) => o.loginId).join(', ') || '(없음)'}`,
    );
  }

  await prisma.employee.update({
    where: { id: employee.id },
    data: { passwordHash: await bcrypt.hash(password, 12) },
  });

  console.log(`[reset:password] ${employee.name}(${employee.position}) — 아이디 "${loginId}" 비밀번호를 변경했습니다.`);
  if (!employee.active) {
    console.warn('[reset:password] 주의: 이 계정은 비활성 상태라 비밀번호를 바꿔도 로그인되지 않습니다.');
  }
}

main()
  .catch((e: Error) => {
    console.error(e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
