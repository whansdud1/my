// 003-schedule-coordination — T006
// 공통 가능 시간 계산 (순수 함수, DB·IO 의존 없음 → 단위 테스트 용이)

export interface AvailabilityInput {
  userId: number;
  weekday: number; // 0=일 .. 6=토
  startMin: number; // 0..1439
  endMin: number; // 1..1440
}

export interface CommonSlot {
  weekday: number;
  startMin: number;
  endMin: number;
  availableCount: number;
  totalMembers: number;
}

const DAY_MIN = 1440;

/**
 * 멤버들의 주간 가용시간을 교집합 계산해 공통 슬롯을 산출한다.
 * - 요일별 분(0..1439) 카운트 배열에 각 멤버 슬롯을 누적
 * - 멤버는 같은 요일에 여러 구간을 가질 수 있으나 한 분에 대해 1회만 카운트(멤버 단위 dedup)
 * - 최소 길이(minMinutes) 이상인 연속 구간만 후보
 * - 전원(=totalMembers) 가능 구간이 있으면 그것만, 없으면 최대 카운트 구간을 차선으로 반환
 * - 정렬: availableCount 내림차순 → 길이 내림차순 → 이른 시간순
 */
export function computeCommonSlots(
  availabilities: AvailabilityInput[],
  totalMembers: number,
  minMinutes = 30,
): CommonSlot[] {
  if (totalMembers <= 0) return [];

  // weekday → Int 카운트 배열(분 단위)
  const counts: Map<number, Int16Array> = new Map();
  // 멤버 단위 중복 방지: weekday별로 (userId, minute) 1회만
  const seen: Map<number, Set<number>> = new Map();

  for (const a of availabilities) {
    if (a.weekday < 0 || a.weekday > 6) continue;
    const s = Math.max(0, Math.min(DAY_MIN, a.startMin));
    const e = Math.max(0, Math.min(DAY_MIN, a.endMin));
    if (e <= s) continue;
    if (!counts.has(a.weekday)) {
      counts.set(a.weekday, new Int16Array(DAY_MIN));
      seen.set(a.weekday, new Set());
    }
    const arr = counts.get(a.weekday)!;
    const seenDay = seen.get(a.weekday)!;
    for (let m = s; m < e; m++) {
      const key = a.userId * DAY_MIN + m;
      if (seenDay.has(key)) continue; // 같은 멤버의 중복 구간 무시
      seenDay.add(key);
      arr[m] = (arr[m] ?? 0) + 1;
    }
  }

  const slots: CommonSlot[] = [];
  for (const [weekday, arr] of counts) {
    // 전원 가능 여부 우선 판단 → 임계 카운트 결정
    let maxCount = 0;
    for (let m = 0; m < DAY_MIN; m++) if (arr[m]! > maxCount) maxCount = arr[m]!;
    if (maxCount === 0) continue;
    const threshold = maxCount >= totalMembers ? totalMembers : maxCount;

    // threshold 이상인 연속 구간 추출
    let runStart = -1;
    for (let m = 0; m <= DAY_MIN; m++) {
      const ok = m < DAY_MIN && arr[m]! >= threshold;
      if (ok && runStart < 0) runStart = m;
      else if (!ok && runStart >= 0) {
        if (m - runStart >= minMinutes) {
          slots.push({
            weekday,
            startMin: runStart,
            endMin: m,
            availableCount: threshold,
            totalMembers,
          });
        }
        runStart = -1;
      }
    }
  }

  slots.sort(
    (a, b) =>
      b.availableCount - a.availableCount ||
      b.endMin - b.startMin - (a.endMin - a.startMin) ||
      a.weekday - b.weekday ||
      a.startMin - b.startMin,
  );
  return slots;
}

// 분 → 'HH:MM' (표시 보조)
export function minToHHMM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
