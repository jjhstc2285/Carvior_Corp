/**
 * 임직원 시드.
 *
 * 실제 명단(실명·휴대폰번호)은 개인정보라 저장소에 커밋하지 않는다.
 * `prisma/employees.json`(.gitignore 처리됨)을 읽고, 없으면 예시 파일로 대체한다.
 *
 *   실행: npm run seed
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as bcrypt from 'bcrypt';
import { AuthProvider, PrismaClient, Role } from '@prisma/client';
import { invalidateEmployeeCache } from './invalidate-employee-cache';

const prisma = new PrismaClient();

interface SeedEmployee {
  name: string;
  position: string;
  phones: string[];
  role?: keyof typeof Role;
  department?: string;
  loginId?: string;
}

function loadRoster(): SeedEmployee[] {
  const realPath = join(__dirname, 'employees.json');
  const examplePath = join(__dirname, 'employees.example.json');

  if (existsSync(realPath)) {
    return JSON.parse(readFileSync(realPath, 'utf-8')) as SeedEmployee[];
  }

  console.warn(
    '\n[seed] prisma/employees.json 이 없어 예시 명단으로 시드합니다.\n' +
      '       실제 명단을 넣으려면 employees.example.json 을 복사해 employees.json 으로 만드세요.\n',
  );
  return JSON.parse(readFileSync(examplePath, 'utf-8')) as SeedEmployee[];
}

async function main() {
  const roster = loadRoster();

  // 관리자 초기 비밀번호는 환경변수로 받는다(코드에 박아두지 않는다).
  const defaultPassword = process.env.ADMIN_DEFAULT_PASSWORD;
  if (roster.some((e) => e.role === 'ADMIN') && !defaultPassword) {
    throw new Error(
      'ADMIN_DEFAULT_PASSWORD 환경변수가 필요합니다. 예) ADMIN_DEFAULT_PASSWORD=... npm run seed',
    );
  }

  for (const person of roster) {
    const role = (person.role ?? 'EMPLOYEE') as Role;
    const isAdmin = role === Role.ADMIN;

    const base = {
      name: person.name,
      position: person.position,
      department: person.department ?? null,
      role,
      active: true,
      provider: isAdmin && person.loginId ? AuthProvider.LOCAL : null,
    };

    const phoneRows = (person.phones ?? []).map((number, sortOrder) => ({ number, sortOrder }));

    // 이름으로 찾아 없으면 만들고 있으면 갱신 — 여러 번 돌려도 중복이 안 생긴다.
    const existing = await prisma.employee.findFirst({ where: { name: person.name } });

    if (existing) {
      // 이미 비밀번호를 바꿔 쓰고 있을 수 있으므로 기존 계정의 passwordHash는 건드리지 않는다.
      await prisma.employee.update({
        where: { id: existing.id },
        data: {
          ...base,
          ...(person.loginId ? { loginId: person.loginId } : {}),
          // 번호는 통째로 갈아끼운다(명단이 최신 기준).
          phones: { deleteMany: {}, create: phoneRows },
        },
      });
      console.log(`[seed] 갱신: ${person.name} (${person.position})`);
    } else {
      await prisma.employee.create({
        data: {
          ...base,
          ...(isAdmin && person.loginId
            ? {
                loginId: person.loginId,
                passwordHash: await bcrypt.hash(defaultPassword as string, 12),
              }
            : {}),
          phones: { create: phoneRows },
        },
      });
      console.log(`[seed] 생성: ${person.name} (${person.position})${isAdmin ? ' — 관리자' : ''}`);
    }
  }

  // 서버가 명단을 5분 캐시한다 — 안 비우면 방금 넣은 직원이 화면에 바로 안 나온다.
  await invalidateEmployeeCache('seed');

  const adminCount = await prisma.employee.count({ where: { role: Role.ADMIN } });
  console.log(`\n[seed] 완료. 총 ${roster.length}명, 관리자 ${adminCount}명.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
