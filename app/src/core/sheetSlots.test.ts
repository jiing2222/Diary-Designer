import { describe, expect, it } from 'vitest';
import {
  clearSheetSlotValue,
  duplicateSheetSlots,
  migrateFlatSheetSlots,
  removeSheetSlots,
  setSheetSlotValue,
  sheetSlotKey,
  sheetSlotValue,
  trimSheetSlots,
} from './sheetSlots';

describe('시트별 슬롯 주소', () => {
  it('한 장의 칸 수와 무관하게 시트와 슬롯을 따로 찾는다', () => {
    const slots = setSheetSlotValue({}, 1, 0, '둘째 장 첫 칸');
    expect(sheetSlotValue(slots, 1, 0)).toBe('둘째 장 첫 칸');
    expect(sheetSlotValue(slots, 0, 4)).toBeUndefined();
    expect(sheetSlotKey(1, 0)).toBe('1:0');
  });

  it('옛 전역 번호를 불러올 때만 당시 칸 수로 나눈다', () => {
    expect(migrateFlatSheetSlots({ 4: '둘째 장 첫 칸' }, 4)).toEqual({ 1: { 0: '둘째 장 첫 칸' } });
  });

  it('복사·삭제·장수 축소 때 시트 단위로 이동하거나 제거한다', () => {
    const original = { 0: { 1: 'A' }, 2: { 0: 'C' } };
    expect(duplicateSheetSlots(original, 0)).toEqual({ 0: { 1: 'A' }, 1: { 1: 'A' }, 3: { 0: 'C' } });
    expect(removeSheetSlots(original, 1)).toEqual({ 0: { 1: 'A' }, 1: { 0: 'C' } });
    expect(trimSheetSlots(original, 2)).toEqual({ 0: { 1: 'A' } });
    expect(clearSheetSlotValue(original, 0, 1)).toEqual({ 2: { 0: 'C' } });
  });
});
