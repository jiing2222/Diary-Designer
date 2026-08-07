import { dateAtOffset, dayOfWeek, weekOfYear, type CalendarDate, type Dataset } from './dataset';
import { isText, type DiaryObject } from './objects';

// 일요일(0)부터. 월간 달력 오브젝트(core/calendar.ts)의 요일 이름과는 별도로
// 둔다 — 그쪽은 달력 그리드 머리글에 쓰는 짧은 이름만 필요하지만, 여기는
// 글자 서식이라 길고 짧은 이름·영어까지 다 필요하다.
const WEEKDAY_KR = ['일', '월', '화', '수', '목', '금', '토'];
const WEEKDAY_KR_LONG = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
const WEEKDAY_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_EN_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_EN = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const MONTH_EN_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * 날짜를 서식 문자열로.
 *
 * 서식 id는 core/text의 `FIELD_FORMATS`가 낸다 — 편집 화면의 드롭다운과
 * 여기 계산이 같은 목록을 봐야 고른 것과 인쇄되는 것이 어긋나지 않는다.
 */
export function formatDate(d: CalendarDate, formatId: string): string {
  const pad2 = (n: number) => String(n).padStart(2, '0');
  switch (formatId) {
    case 'D':
      return String(d.day);
    case 'M월 D일':
      return `${d.month}월 ${d.day}일`;
    case 'YYYY-MM-DD':
      return `${d.year}-${pad2(d.month)}-${pad2(d.day)}`;
    case 'YYYY년 M월':
      return `${d.year}년 ${d.month}월`;
    case 'ddd':
      return WEEKDAY_KR[dayOfWeek(d)];
    case 'dddd':
      return WEEKDAY_KR_LONG[dayOfWeek(d)];
    case 'ddd-en':
      return WEEKDAY_EN[dayOfWeek(d)];
    case 'dddd-en':
      return WEEKDAY_EN_LONG[dayOfWeek(d)];
    case 'M':
      return String(d.month);
    case 'M월':
      return `${d.month}월`;
    case 'MMM':
      return MONTH_EN[d.month - 1];
    case 'MMMM':
      return MONTH_EN_LONG[d.month - 1];
    case '주차':
      return `${weekOfYear(d)}주차`;
    case 'W':
      return `W${weekOfYear(d)}`;
    case 'Week':
      return `Week ${weekOfYear(d)}`;
    case 'M/D':
    default:
      return `${d.month}/${d.day}`;
  }
}

/**
 * 데이터셋의 이 쪽(page, 0부터)에 맞춰 자동 필드를 실제 값으로 바꾼다.
 *
 * **결과 객체에는 `field`가 없다.** core/text의 `displayText`가 `field`가
 * 있으면 자리표시를 우선하므로, 진짜 값을 보여주려면 `field`를 떼고 `text`에
 * 계산한 값을 넣어야 한다 — 이러면 화면·PDF의 렌더링 쪽은 손댈 필요가 없다.
 *
 * 데이터가 모자라면(마지막 쪽의 남는 오프셋 등) 빈 문자열이다 — 그 글자만
 * 비어 보인다. 굵기·색 같은 다른 값은 그대로 물려받는다.
 *
 * **월간 달력 데이터셋에는 자동 필드가 없다.** 42칸을 손으로 찍는 대신
 * 달력 오브젝트 하나가 스스로 채운다(10단계) — 이 함수는 날짜형만 다룬다.
 */
export function resolveObjectsForPage(
  objects: DiaryObject[],
  dataset: Dataset,
  page: number,
): DiaryObject[] {
  return objects.map((o) => {
    if (!isText(o) || !o.field) return o;
    const date = dataset.kind === 'date' ? dateAtOffset(dataset, page, o.field.offset) : null;
    const text = date ? formatDate(date, o.field.format) : '';
    const { field: _field, ...rest } = o;
    return { ...rest, text };
  });
}
