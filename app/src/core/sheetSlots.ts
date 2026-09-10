/** 시트 번호와 그 안의 슬롯 번호를 따로 보관하는 저장 모양. */
export type SheetSlots<T> = Record<number, Record<number, T>>;

/** 화면·PDF가 함께 쓰는, 한 칸의 안정적인 주소. 칸 수에는 의존하지 않는다. */
export function sheetSlotKey(sheet: number, slot: number): string {
  return `${sheet}:${slot}`;
}

export function sheetSlotValue<T>(slots: SheetSlots<T>, sheet: number, slot: number): T | undefined {
  return slots[sheet]?.[slot];
}

export function hasSheetSlot<T>(slots: SheetSlots<T>, sheet: number, slot: number): boolean {
  return Object.prototype.hasOwnProperty.call(slots[sheet] ?? {}, slot);
}

export function setSheetSlotValue<T>(
  slots: SheetSlots<T>,
  sheet: number,
  slot: number,
  value: T,
): SheetSlots<T> {
  return { ...slots, [sheet]: { ...slots[sheet], [slot]: value } };
}

export function clearSheetSlotValue<T>(
  slots: SheetSlots<T>,
  sheet: number,
  slot: number,
): SheetSlots<T> {
  if (!hasSheetSlot(slots, sheet, slot)) return slots;
  const row = { ...slots[sheet] };
  delete row[slot];
  const next = { ...slots };
  if (Object.keys(row).length === 0) delete next[sheet];
  else next[sheet] = row;
  return next;
}

/** 시트 하나를 바로 뒤에 복사하고, 뒤쪽 시트 번호를 한 칸씩 민다. */
export function duplicateSheetSlots<T>(slots: SheetSlots<T>, sheet: number): SheetSlots<T> {
  const next: SheetSlots<T> = {};
  for (const [raw, row] of Object.entries(slots)) {
    const source = Number(raw);
    next[source > sheet ? source + 1 : source] = { ...row };
    if (source === sheet) next[sheet + 1] = { ...row };
  }
  return next;
}

/** 시트 하나를 지우고, 뒤쪽 시트 번호를 한 칸씩 당긴다. */
export function removeSheetSlots<T>(slots: SheetSlots<T>, sheet: number): SheetSlots<T> {
  const next: SheetSlots<T> = {};
  for (const [raw, row] of Object.entries(slots)) {
    const source = Number(raw);
    if (source === sheet) continue;
    next[source > sheet ? source - 1 : source] = { ...row };
  }
  return next;
}

/** 장수를 줄였을 때 화면 밖에 남은 시트 데이터를 함께 버린다. */
export function trimSheetSlots<T>(slots: SheetSlots<T>, sheets: number): SheetSlots<T> {
  return Object.fromEntries(
    Object.entries(slots)
      .filter(([raw]) => Number(raw) < sheets)
      .map(([raw, row]) => [raw, { ...row }]),
  );
}

/** 85864ab 저장 파일의 `sheet × 칸 수 + slot` 키를 새 2단계 주소로 옮긴다. */
export function migrateFlatSheetSlots<T>(flat: Record<number, T>, slotsPerSheet: number): SheetSlots<T> {
  if (slotsPerSheet <= 0) return {};
  let next: SheetSlots<T> = {};
  for (const [raw, value] of Object.entries(flat)) {
    const global = Number(raw);
    next = setSheetSlotValue(next, Math.floor(global / slotsPerSheet), global % slotsPerSheet, value);
  }
  return next;
}
