import { calendarCellAt, calendarTitleAt, dateAtOffset, type CalendarDate, type Dataset } from './dataset';
import { isText, type DiaryObject } from './objects';

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
    case 'M/D':
    default:
      return `${d.month}/${d.day}`;
  }
}

/**
 * 이 자동 필드가 가리키는 날짜. 데이터셋 종류에 따라 계산이 다르다.
 *
 * 월간 달력은 `title`이면 오프셋과 무관하게 그 쪽(달)의 1일을, 아니면
 * 42칸 그리드에서 그 오프셋의 칸을 본다. 날짜형은 오프셋이 그대로
 * "이 쪽의 몇 번째 값"이다.
 */
function dateForField(dataset: Dataset, page: number, field: { offset: number; title?: boolean }): CalendarDate | null {
  if (dataset.kind === 'calendar') {
    return field.title ? calendarTitleAt(dataset, page) : calendarCellAt(dataset, page, field.offset);
  }
  return dateAtOffset(dataset, page, field.offset);
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
 */
export function resolveObjectsForPage(
  objects: DiaryObject[],
  dataset: Dataset,
  page: number,
): DiaryObject[] {
  return objects.map((o) => {
    if (!isText(o) || !o.field) return o;
    const date = dateForField(dataset, page, o.field);
    const text = date ? formatDate(date, o.field.format) : '';
    const { field: _field, ...rest } = o;
    return { ...rest, text };
  });
}
