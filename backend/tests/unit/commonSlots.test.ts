// 003-schedule-coordination — T021
// computeCommonSlots 순수 함수 단위 테스트: 교집합·차선·최소길이·정렬·dedup.
import { describe, it, expect } from '@jest/globals';
import {
  computeCommonSlots,
  minToHHMM,
  type AvailabilityInput,
} from '../../src/services/schedule/commonSlots.js';

// 헬퍼: 가용시간 한 줄
const av = (userId: number, weekday: number, startMin: number, endMin: number): AvailabilityInput => ({
  userId,
  weekday,
  startMin,
  endMin,
});

describe('computeCommonSlots', () => {
  it('전원 가능 구간만 교집합으로 산출한다(겹치는 부분만)', () => {
    // 월요일(1): u1 09:00-12:00, u2 10:00-13:00 → 공통 10:00-12:00
    const slots = computeCommonSlots([av(1, 1, 540, 720), av(2, 1, 600, 780)], 2, 30);
    expect(slots).toHaveLength(1);
    expect(slots[0]).toMatchObject({
      weekday: 1,
      startMin: 600, // 10:00
      endMin: 720, // 12:00
      availableCount: 2,
      totalMembers: 2,
    });
  });

  it('전원 가능 구간이 없으면 최대 인원(차선) 구간을 반환한다', () => {
    // 월: u1 09-10, u2 10-11, u3 09:30-10:30 → 전원(3) 겹치는 구간 없음.
    // 최대 겹침=2 (09:30-10:00: u1+u3, 10:00-10:30: u2+u3)
    const slots = computeCommonSlots(
      [av(1, 1, 540, 600), av(2, 1, 600, 660), av(3, 1, 570, 630)],
      3,
      30,
    );
    expect(slots.length).toBeGreaterThan(0);
    // 전원(3) 구간은 없어야 한다
    expect(slots.every((s) => s.availableCount === 2)).toBe(true);
    expect(slots.every((s) => s.totalMembers === 3)).toBe(true);
  });

  it('최소 길이(minMinutes) 미만 구간은 후보에서 제외한다', () => {
    // 공통 구간이 20분뿐 → minMinutes=30이면 제외
    const slots = computeCommonSlots([av(1, 2, 600, 620), av(2, 2, 600, 620)], 2, 30);
    expect(slots).toHaveLength(0);
  });

  it('정확히 minMinutes 길이는 포함한다(경계 포함)', () => {
    const slots = computeCommonSlots([av(1, 2, 600, 630), av(2, 2, 600, 630)], 2, 30);
    expect(slots).toHaveLength(1);
    expect(slots[0]!.endMin - slots[0]!.startMin).toBe(30);
  });

  it('같은 멤버의 중복/겹치는 구간은 1회만 카운트한다(멤버 단위 dedup)', () => {
    // u1이 같은 요일에 겹치는 두 구간을 제출해도 카운트는 1 → 혼자선 전원(2) 충족 못함
    const slots = computeCommonSlots(
      [av(1, 3, 540, 660), av(1, 3, 600, 720), av(2, 3, 600, 660)],
      2,
      30,
    );
    // u1+u2 공통은 10:00-11:00 (600-660), count=2
    expect(slots).toHaveLength(1);
    expect(slots[0]).toMatchObject({ startMin: 600, endMin: 660, availableCount: 2 });
  });

  it('겹침 인원 내림차순 → 길이 내림차순 → 이른 시간순으로 정렬한다', () => {
    // 화(2): 전원2 09:00-09:40 (40분)
    // 수(3): 전원2 09:00-10:00 (60분)
    // 두 구간 모두 count=2 → 길이가 긴 수요일(60분)이 먼저
    const slots = computeCommonSlots(
      [av(1, 2, 540, 580), av(2, 2, 540, 580), av(1, 3, 540, 600), av(2, 3, 540, 600)],
      2,
      30,
    );
    expect(slots).toHaveLength(2);
    expect(slots[0]!.weekday).toBe(3); // 더 긴 구간 우선
    expect(slots[1]!.weekday).toBe(2);
  });

  it('totalMembers가 0 이하면 빈 배열을 반환한다', () => {
    expect(computeCommonSlots([av(1, 1, 540, 600)], 0)).toEqual([]);
  });

  it('잘못된 입력(요일 범위 밖, end<=start)은 무시한다', () => {
    const slots = computeCommonSlots(
      [av(1, 7, 540, 600), av(1, 1, 600, 600), av(1, 1, 540, 600), av(2, 1, 540, 600)],
      2,
      30,
    );
    // 유효한 건 u1·u2의 월 09:00-10:00 뿐
    expect(slots).toHaveLength(1);
    expect(slots[0]).toMatchObject({ weekday: 1, startMin: 540, endMin: 600 });
  });

  it('가용시간이 전혀 없으면 빈 배열', () => {
    expect(computeCommonSlots([], 3)).toEqual([]);
  });
});

describe('minToHHMM', () => {
  it('분을 HH:MM으로 변환한다', () => {
    expect(minToHHMM(0)).toBe('00:00');
    expect(minToHHMM(540)).toBe('09:00');
    expect(minToHHMM(605)).toBe('10:05');
    expect(minToHHMM(1439)).toBe('23:59');
  });
});
