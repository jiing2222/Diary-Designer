import { dateAtOffset, majorityMonthDate, type CalendarDate, type Dataset } from './dataset';
import { fieldValue, formatDate, isMonthLevel } from './fieldFormat';
import { dateColorOf, ruleAppliesTo, type ColorRules } from './colorRules';
import { isMoon, isText, type DiaryObject } from './objects';
import { moonPhaseOf } from './moon';
import { FIELD_PATTERN } from './text';

/**
 * 날짜를 서식으로 바꾸는 규칙은 core/fieldFormat에 있다(형식 코드). 옛 이름으로 부르던
 * 곳(달력 제목 등)을 위해 여기서도 내보낸다.
 */
export { formatDate };

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
 * **"몇 월"만 보여주는 서식은 오프셋의 날짜가 아니라 그 쪽의 대표 달을
 * 쓴다**(`majorityMonthDate`). 위클리 등에서 한 쪽이 두 달에 걸치면(예:
 * 8/31~9/6), 오프셋 0(8/31)만 보고 "8월"로 표시되면 그 쪽 대부분이 9월인데도
 * 어색하다 — 이 쪽에 더 많이 걸친 달을 대신 쓴다(사용자 피드백). 날짜 하나를
 * 짚어야 하는 다른 서식(일·요일·주차 등)은 그대로 오프셋의 날짜를 쓴다.
 *
 * **월간 달력 데이터셋에는 자동 필드가 없다.** 42칸을 손으로 찍는 대신
 * 달력 오브젝트 하나가 스스로 채운다(10단계) — 이 함수는 날짜형만 다룬다.
 */
export function resolveObjectsForPage(
  objects: DiaryObject[],
  dataset: Dataset,
  page: number,
): DiaryObject[] {
  if (dataset.kind !== 'date') return resolveFieldsWithDates(objects, []);
  const dates = Array.from({ length: dataset.perPage }, (_, offset) => dateAtOffset(dataset, page, offset));
  return resolveFieldsWithDates(objects, dates, majorityMonthDate(dataset, page));
}

/**
 * 이 쪽의 날짜 목록(`dates[오프셋]`)으로 자동 필드를 실제 값으로 바꾼다.
 *
 * `resolveObjectsForPage`(옛 양식)와 리뉴얼의 날짜 묶음(core/dated)이 같이 쓴다 —
 * 날짜를 어떻게 나눌지만 다르고 글자로 바꾸는 규칙은 하나다. 날짜가 없는 오프셋
 * (null — 마지막 쪽의 남는 칸, 달이 바뀌어 비운 칸)은 빈 글자가 된다.
 *
 * `rules`는 작업의 색 규칙(core/colorRules) — 보여줄 때만 준다. 고칠 객체를 만들 때는
 * 주지 않는다(규칙 색이 날짜별 수정으로 잘못 저장되지 않게, core/work).
 *
 * `monthDate`는 "몇 월"만 보여주는 서식이 쓸 대표 날짜다. 안 주면 `dates`에서
 * 가장 많이 걸친 달을 고른다(같으면 앞 달).
 */
export function resolveFieldsWithDates(
  objects: DiaryObject[],
  dates: (CalendarDate | null)[],
  monthDate: CalendarDate | null = majorityMonth(dates),
  rules?: ColorRules,
): DiaryObject[] {
  return objects.map((o) => {
    // 달 모양 — 그 날짜의 위상을 넣는다(그릴 때 core/moon이 모양을 정한다). 날짜가 없으면 위상도 없다.
    if (isMoon(o)) {
      const date = dates[o.offset] ?? null;
      const { phase: _old, ...rest } = o;
      return date ? { ...rest, phase: moonPhaseOf(date) } : rest;
    }
    // 페이지 번호는 면 순서를 알아야 해서 여기서 채우지 않는다(core/work가 채운다).
    if (!isText(o) || !o.field || o.field.kind === 'page') return o;
    const monthLevel = !o.field.kind && isMonthLevel(o.field.format);
    const date = monthLevel ? monthDate : (dates[o.field.offset] ?? null);
    const value = fieldValue(o.field, date);
    // 자리표시가 있던 자리만 진짜 값으로 바꿔 끼운다 — core/text의 displayText와
    // 같은 이유다. 앞뒤에 손으로 붙인 글자(예: "입니다")는 그대로 남는다.
    // 패턴이 없으면(체크박스로 켠 필드) text 전체를 값으로 통째로 바꾼다.
    const { field: _field, ...rest } = o;
    const text = FIELD_PATTERN.test(o.text) ? o.text.replace(FIELD_PATTERN, value) : value;
    // 색 규칙(일·토·공휴일) — 하루를 보여주는 칸만. 날짜별로 바꾼 색은 이 뒤에 얹혀 이긴다.
    const ruleColor = date && ruleAppliesTo(o.field) ? dateColorOf(date, rules) : undefined;
    return ruleColor ? { ...rest, text, color: ruleColor } : { ...rest, text };
  });
}

/** 날짜들 중 가장 많은 날이 속한 달의 날짜. 같으면 앞 달(core/dataset의 majorityMonthDate와 같은 규칙). */
function majorityMonth(dates: (CalendarDate | null)[]): CalendarDate | null {
  const counts = new Map<string, { date: CalendarDate; count: number }>();
  for (const d of dates) {
    if (!d) continue;
    const key = `${d.year}-${d.month}`;
    const entry = counts.get(key);
    if (entry) entry.count++;
    else counts.set(key, { date: d, count: 1 });
  }
  let best: { date: CalendarDate; count: number } | null = null;
  for (const entry of counts.values()) {
    if (!best || entry.count > best.count) best = entry;
  }
  return best?.date ?? null;
}

/**
 * 세트형 한 쪽의 최종 내용.
 *
 * "인쇄하기"에서 그 쪽을 직접 손봤으면(pageOverrides에 있으면) 그 완성된
 * 내용을 그대로 쓴다 — 원본 양식이 바뀌어도 다시 계산하지 않는다. 없으면
 * 지금까지처럼 resolveObjectsForPage로 자동 계산한다. 화면(App.tsx)·PDF
 * (pdf/export.ts) 둘 다 이 함수 하나를 거쳐야 어긋나지 않는다.
 */
export function resolvePageObjects(
  objects: DiaryObject[],
  dataset: Dataset,
  page: number,
  overrides?: Record<number, DiaryObject[]>,
): DiaryObject[] {
  return overrides?.[page] ?? resolveObjectsForPage(objects, dataset, page);
}
