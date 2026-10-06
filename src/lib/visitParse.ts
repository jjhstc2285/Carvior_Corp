import dayjs from 'dayjs';

/**
 * 통화에서 방문 약속을 뽑아낸다.
 *
 * "내일 3시쯤 방문할게요" 는 상담에서 제일 중요한 한 줄이다 — 그 시각에 사람이 붙어
 * 있어야 하고, 차도 빼 둬야 한다. 그런데 통화 내용을 옮겨 적어도 방문 예정일 칸은
 * 여전히 빈 채로 남는다. 읽은 사람이 다시 손으로 옮겨야 해서 자주 빠진다.
 *
 * 말한 날을 기준으로 센다. "내일"은 통화한 날의 다음 날이지, 상담을 적는 날의 다음
 * 날이 아니다 — 어제 온 전화를 오늘 옮겨 적으면 하루가 밀린다.
 *
 * 방문하겠다는 말이 가까이 없으면 아무것도 안 집는다. "3시에 전화드릴게요"까지 방문으로
 * 잡으면 빈 칸보다 나쁘다 — 틀린 약속이 잡혀 있으면 아무도 다시 확인하지 않는다.
 */

export interface Visit {
  /** YYYY-MM-DD — 날을 못 집었으면 빈 칸 */
  date: string;
  /** "오후 3시쯤" 처럼 사람이 말한 대로 — 칸이 자유 입력이라 범위나 두루뭉술한 표현을 살린다 */
  time: string;
  /** 어느 말에서 집었는지 — 화면에 같이 보여 준다. 사람이 보고 아니면 지운다 */
  quote: string;
}

/** 방문하겠다는 뜻의 말. 이게 가까이 없으면 날짜·시각을 집지 않는다 */
const VISIT_WORDS =
  /방문|들를|들러|들리|찾아[가뵈봬]|보러\s*[가오]|가\s*볼|가\s*겠|갈게|갈께|갈 수|오시|오세요|오라고|나갈게|뵐게|뵙겠|출발/;

/** 약속을 무르는 말 — 이런 줄에서는 안 집는다 */
const CANCEL_WORDS = /취소|안\s*[가되]|못\s*[가오]|어렵|미루|다음에/;

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** 한글로 읽은 시각 — "세시" */
const HOUR_WORDS: Record<string, number> = {
  한: 1, 두: 2, 세: 3, 네: 4, 다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9, 열: 10, 열한: 11, 열두: 12,
};

/**
 * 몇 시라고만 하면 오전인지 오후인지 고른다.
 *
 * 차 보러 오는 시간이다 — 새벽 두 시에 오지 않는다. 1시부터 7시까지는 오후로 본다.
 * 8시에서 11시는 오전, 12시는 낮으로 둔다.
 */
function ampmOf(hour: number): string {
  if (hour === 12) return '낮';
  if (hour >= 1 && hour <= 7) return '오후';
  return '오전';
}

/** 말에서 날을 집는다 — 통화한 날이 기준이다 */
function pickDate(line: string, base: dayjs.Dayjs): dayjs.Dayjs | null {
  if (/내일모레|모레/.test(line)) return base.add(2, 'day');
  if (/내일/.test(line)) return base.add(1, 'day');
  if (/글피/.test(line)) return base.add(3, 'day');
  if (/오늘|이따|이따가|지금/.test(line)) return base;

  // 10월 3일 / 3일에
  const md = /(\d{1,2})\s*월\s*(\d{1,2})\s*일/.exec(line);
  if (md) {
    const guess = base.month(Number(md[1]) - 1).date(Number(md[2]));
    // 지난 달을 말했으면 내년이다 — 12월에 "1월 5일"은 다음 해다
    return guess.isBefore(base, 'day') ? guess.add(1, 'year') : guess;
  }
  const dayOnly = /(?:^|[^\d])(\d{1,2})\s*일(?:날)?(?![\d분])/.exec(line);
  if (dayOnly) {
    const n = Number(dayOnly[1]);
    if (n >= 1 && n <= 31) {
      const guess = base.date(n);
      return guess.isBefore(base, 'day') ? guess.add(1, 'month') : guess;
    }
  }

  /*
    요일 — "이번주 토요일", "다음주 월요일", 그냥 "토요일".

    '이번주/다음주'가 붙으면 그 주의 월요일부터 센다. 오늘에서 며칠 뒤인지로 세면
    월요일에 "다음주 월요일"이라고 했을 때 한 주가 더 밀린다.

    아무것도 안 붙으면 다가오는 그 요일이다. 오늘이 그 요일이어도 다음 주로 본다 —
    오늘을 말할 때는 "오늘"이라고 하지 요일로 부르지 않는다.
  */
  const wd = /(이번\s*주|금\s*주|담\s*주|다음\s*주)?\s*([일월화수목금토])\s*요일/.exec(line);
  if (wd) {
    const target = WEEKDAYS.indexOf(wd[2]);
    const fromMonday = (target + 6) % 7; // 월=0 … 일=6
    if (wd[1]) {
      const thisMonday = base.subtract((base.day() + 6) % 7, 'day');
      const monday = /다음|담/.test(wd[1]) ? thisMonday.add(7, 'day') : thisMonday;
      return monday.add(fromMonday, 'day');
    }
    return base.add((target - base.day() + 7) % 7 || 7, 'day');
  }
  return null;
}

/** 말에서 시각을 집는다 — 사람이 말한 결을 살린다 */
function pickTime(line: string): string {
  const ampm = /오전|오후|아침|점심|저녁|밤|새벽/.exec(line)?.[0] ?? '';

  // 두 시부터 세 시까지 — 범위로 말한 것
  const range = /(\d{1,2})\s*시\s*(?:~|-|부터|에서)\s*(\d{1,2})\s*시/.exec(line);
  if (range) {
    const h = Number(range[1]);
    return `${ampm || ampmOf(h)} ${h}시~${Number(range[2])}시`;
  }

  // 3시 / 3시 반 / 3시 30분 / 3시쯤
  const num = /(\d{1,2})\s*시\s*(반|(\d{1,2})\s*분)?\s*(쯤|경|정도|께)?/.exec(line);
  if (num) {
    const h = Number(num[1]);
    if (h >= 0 && h <= 24) {
      // 15시처럼 24시간으로 말하면 그대로 고쳐 적는다
      const hour = h > 12 ? h - 12 : h;
      const mark = h > 12 ? '오후' : ampm || ampmOf(h);
      const minute = num[2] === '반' ? ' 30분' : num[3] ? ` ${Number(num[3])}분` : '';
      return `${mark} ${hour}시${minute}${num[4] ?? ''}`;
    }
  }

  // 세시 / 네시 반 — 한글로 읽은 것
  const word = new RegExp(`(${Object.keys(HOUR_WORDS).sort((a, b) => b.length - a.length).join('|')})\\s*시\\s*(반)?\\s*(쯤|경|정도|께)?`).exec(line);
  if (word) {
    const h = HOUR_WORDS[word[1]];
    return `${ampm || ampmOf(h)} ${h}시${word[2] ? ' 30분' : ''}${word[3] ?? ''}`;
  }

  // 시각 없이 때만 말한 것 — "내일 오전에 갈게요"
  return ampm ? `${ampm}` : '';
}

/**
 * 통화 전체에서 방문 약속을 찾는다.
 *
 * 줄 단위로 본다. 한 줄에 "내일"과 "3시"와 "갈게요"가 같이 있는 게 보통이고, 줄을
 * 넘겨 짜맞추기 시작하면 엉뚱한 날과 엉뚱한 시각이 붙는다.
 *
 * 뒤에 말한 것을 쓴다 — 통화 중에 약속이 바뀌면 나중 말이 맞다.
 */
export function parseVisit(text: string, calledAt: string): Visit | null {
  const base = dayjs(calledAt.slice(0, 10));
  if (!base.isValid()) return null;

  let best: Visit | null = null;
  for (const raw of text.split(/\n+/)) {
    const line = raw.trim();
    if (!line || !VISIT_WORDS.test(line) || CANCEL_WORDS.test(line)) continue;

    const date = pickDate(line, base);
    const time = pickTime(line);
    if (!date && !time) continue;

    best = {
      date: date ? date.format('YYYY-MM-DD') : '',
      time,
      // 말한 사람 표시는 떼고 말만 남긴다
      quote: line.replace(/^(손님|상담원)\s*:\s*/, '').slice(0, 60),
    };
  }
  return best;
}

/** 한글로 읽은 시각 — "세시" (visitHour 에서도 쓴다) */
const PART_OF_DAY: { word: RegExp; hour: number }[] = [
  { word: /새벽/, hour: 8 },
  { word: /아침/, hour: 9 },
  { word: /오전/, hour: 10 },
  { word: /점심|낮/, hour: 12 },
  { word: /오후/, hour: 14 },
  { word: /저녁|밤/, hour: 18 },
];

function to24(hour: number, mark: string): number {
  if (/오전|아침|새벽/.test(mark)) return hour === 12 ? 0 : hour;
  if (/오후|저녁|밤/.test(mark)) return hour < 12 ? hour + 12 : hour;
  if (hour === 12) return 12;
  return hour >= 1 && hour <= 7 ? hour + 12 : hour;
}

/**
 * 적힌 방문 시각을 한 시간짜리 자리로 바꾼다 — "오후 3시~4시" → 15.
 *
 * 범위로 적힌 건 시작 시각으로 본다. 때만 말한 것도 자리는 잡아 준다("오전" → 10시).
 * 아무것도 못 집으면 null 이다.
 *
 * 나누는 계산은 서버가 한다(server/src/consultations/visit-slot.ts). 여기 것은 화면에서
 * 차례를 세우고 몇 시 자리인지 보여주는 데만 쓴다 — 고칠 땐 양쪽을 같이 본다.
 */
export function visitHour(text: string | null | undefined): number | null {
  const line = (text ?? '').trim();
  if (!line) return null;

  const mark = /오전|오후|아침|점심|저녁|밤|새벽|낮/.exec(line)?.[0] ?? '';

  const colon = /(\d{1,2})\s*:\s*(\d{2})/.exec(line);
  if (colon) {
    const h = Number(colon[1]);
    if (h >= 0 && h <= 23) return to24(h, mark);
  }

  const num = /(\d{1,2})\s*시/.exec(line);
  if (num) {
    const h = Number(num[1]);
    if (h >= 0 && h <= 23) return to24(h, mark);
  }

  const words = Object.keys(HOUR_WORDS).sort((a, b) => b.length - a.length).join('|');
  const word = new RegExp(`(${words})\s*시`).exec(line);
  if (word) return to24(HOUR_WORDS[word[1]], mark);

  return PART_OF_DAY.find(p => p.word.test(line))?.hour ?? null;
}
