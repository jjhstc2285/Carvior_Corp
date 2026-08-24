/**
 * 직원 로그인 계정 발급.
 *
 * 명단 시드(seed.ts)는 관리자에게만 아이디/비밀번호를 만들어준다. 소셜 연동 없이
 * 아이디로 바로 들어와야 하는 직원들에게 계정을 내주는 게 이 스크립트다.
 *
 *   실행: npm run seed:logins
 *
 * 아이디·비밀번호·직급은 `prisma/employee-logins.json`에서 읽는다(.gitignore 처리됨 —
 * 실제 비밀번호라 저장소에 커밋하면 안 된다). 없으면 예시 파일로 대체한다.
 *
 * 이름으로 기존 직원을 찾아 계정을 붙인다. 명단에 없는 이름이면 새로 만든다.
 *
 * ⚠️ seed.ts와 달리 이 스크립트는 비밀번호를 덮어쓴다 — 발급이 목적이기 때문이다.
 *    이미 본인이 바꿔 쓰고 있는 계정에 다시 돌리면 그 비밀번호가 초기화된다.
 *    한 사람만 초기화하려면 `npm run reset:password`를 쓸 것.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as bcrypt from 'bcrypt';
import { AuthProvider, PrismaClient, Role } from '@prisma/client';
import { invalidateEmployeeCache } from './invalidate-employee-cache';

const prisma = new PrismaClient();

interface LoginSeed {
  name: string;
  loginId: string;
  password: string;
  /** 명단의 직급을 이 값으로 갱신한다(생략하면 그대로 둔다) */
  position?: string;
}

/**
 * 파일이 없으면 그냥 실패한다.
 *
 * 명단 시드(seed.ts)처럼 예시로 대체하면 안 된다 — 여기서 만드는 건 '로그인할 수 있는
 * 계정'이라, 실수로 예시가 돌면 실재하지 않는 사람에게 로그인 수단이 생긴다.
 * 실제로 한 번 그랬다.
 */
function loadLogins(): LoginSeed[] {
  const realPath = join(__dirname, 'employee-logins.json');

  if (!existsSync(realPath)) {
    throw new Error(
      'prisma/employee-logins.json 이 없습니다.\n' +
        '        employee-logins.example.json 을 참고해 만든 뒤 다시 실행하세요.\n' +
        `        찾은 경로: ${realPath}`,
    );
  }

  const parsed: unknown = JSON.parse(readFileSync(realPath, 'utf-8'));
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('prisma/employee-logins.json 이 비어 있거나 배열이 아닙니다.');
  }
  return parsed as LoginSeed[];
}

/** 같은 아이디를 두 사람에게 주면 DB 유니크 제약에서 터진다 — 돌리기 전에 잡는다. */
function assertNoDuplicates(logins: LoginSeed[]): void {
  const seen = new Map<string, string>();
  for (const entry of logins) {
    const owner = seen.get(entry.loginId);
    if (owner) throw new Error(`아이디 "${entry.loginId}"가 ${owner}, ${entry.name} 둘에게 겹칩니다.`);
    seen.set(entry.loginId, entry.name);
  }
}

async function main() {
  const logins = loadLogins();
  assertNoDuplicates(logins);

  for (const entry of logins) {
    const matches = await prisma.employee.findMany({ where: { name: entry.name }, select: { id: true } });
    if (matches.length > 1) {
      console.error(`[seed:logins] 건너뜀: "${entry.name}" 동명이인이 ${matches.length}명입니다. 직접 처리하세요.`);
      continue;
    }

    // 다른 사람이 이미 그 아이디를 쓰고 있으면 덮어쓰지 않고 알린다.
    const holder = await prisma.employee.findUnique({
      where: { loginId: entry.loginId },
      select: { id: true, name: true },
    });
    if (holder && holder.id !== matches[0]?.id) {
      console.error(`[seed:logins] 건너뜀: 아이디 "${entry.loginId}"는 이미 ${holder.name}의 것입니다.`);
      continue;
    }

    const passwordHash = await bcrypt.hash(entry.password, 12);
    const credentials = {
      provider: AuthProvider.LOCAL,
      loginId: entry.loginId,
      passwordHash,
      active: true,
      ...(entry.position ? { position: entry.position } : {}),
    };

    if (matches[0]) {
      await prisma.employee.update({ where: { id: matches[0].id }, data: credentials });
      console.log(`[seed:logins] 발급: ${entry.name} (${entry.position ?? '직급 유지'}) → ${entry.loginId}`);
    } else {
      await prisma.employee.create({
        data: { name: entry.name, position: entry.position ?? '사원', role: Role.EMPLOYEE, ...credentials },
      });
      console.log(`[seed:logins] 신규: ${entry.name} (${entry.position ?? '사원'}) → ${entry.loginId}`);
    }
  }

  // 서버가 명단을 캐시한다 — 안 비우면 바뀐 직급이 화면에 바로 안 나온다.
  await invalidateEmployeeCache('seed:logins');

  // 아직 계정이 없는 사람은 로그인을 못 하므로 마지막에 짚어준다.
  const noLogin = await prisma.employee.findMany({
    where: { active: true, loginId: null, provider: null },
    select: { name: true, position: true },
    orderBy: { createdAt: 'asc' },
  });
  if (noLogin.length) {
    console.log(`\n[seed:logins] 아직 로그인 수단이 없는 직원 ${noLogin.length}명:`);
    for (const p of noLogin) console.log(`              - ${p.name} (${p.position})`);
  }

  console.log(`\n[seed:logins] 완료. ${logins.length}건 처리.`);
  console.log('[seed:logins] 비밀번호는 콘솔에 찍지 않습니다 — prisma/employee-logins.json 을 보세요.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
