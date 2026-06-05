import * as repo from '../../repositories/notifications.js';

// 002-notification-system — T023 preferenceService
// 행 부재 시 notification_types 기본값 적용. is_mandatory 종류는 항상 수신(FR-C3).

export interface EffectivePref {
  type: string;
  inApp: boolean;
  email: boolean;
  push: boolean;
  mandatory: boolean;
}

export interface GlobalSettings {
  dndEnabled: boolean;
  quietStart: string; // 'HH:MM'
  quietEnd: string;
  timezone: string;
}

const DEFAULT_SETTINGS: GlobalSettings = {
  dndEnabled: false,
  quietStart: '22:00',
  quietEnd: '08:00',
  timezone: 'Asia/Seoul',
};

function hhmm(t: string): string {
  // DB TIME 'HH:MM:SS' → 'HH:MM'
  return t.length >= 5 ? t.slice(0, 5) : t;
}

// 단일 종류의 유효 설정 — 채널 라우팅에서 사용
export async function effectiveFor(userId: number, type: string): Promise<EffectivePref> {
  const t = await repo.getType(type);
  const mandatory = Boolean(t?.is_mandatory);
  const pref = await repo.getPref(userId, type);
  if (mandatory) {
    // 필수: 사용자 설정과 무관하게 인앱+이메일 강제(푸시는 WA-01로 제외)
    return { type, inApp: true, email: true, push: false, mandatory: true };
  }
  if (!pref) {
    // 기본값: 인앱·이메일 on, 푸시 off
    return { type, inApp: true, email: true, push: false, mandatory: false };
  }
  return {
    type,
    inApp: Boolean(pref.in_app),
    email: Boolean(pref.email),
    push: Boolean(pref.push),
    mandatory: false,
  };
}

// 전체 종류 × 사용자 설정 — 설정 화면용
export async function bundleFor(userId: number): Promise<{ preferences: EffectivePref[]; global: GlobalSettings }> {
  const types = await repo.listTypes();
  const prefRows = await repo.getPrefs(userId);
  const prefMap = new Map(prefRows.map((p) => [p.type, p]));

  const preferences: EffectivePref[] = types.map((t) => {
    const mandatory = Boolean(t.is_mandatory);
    const p = prefMap.get(t.code);
    if (mandatory) return { type: t.code, inApp: true, email: true, push: false, mandatory: true };
    if (!p) return { type: t.code, inApp: true, email: true, push: false, mandatory: false };
    return {
      type: t.code,
      inApp: Boolean(p.in_app),
      email: Boolean(p.email),
      push: Boolean(p.push),
      mandatory: false,
    };
  });

  const s = await repo.getSettings(userId);
  const global: GlobalSettings = s
    ? {
        dndEnabled: Boolean(s.dnd_enabled),
        quietStart: hhmm(s.quiet_start),
        quietEnd: hhmm(s.quiet_end),
        timezone: s.timezone,
      }
    : { ...DEFAULT_SETTINGS };

  return { preferences, global };
}

export interface PrefUpdate {
  type: string;
  inApp: boolean;
  email: boolean;
  push: boolean;
}

// 설정 갱신 — 필수 종류는 비활성 불가(FR-C3). 위반 시 throw.
export async function updateBundle(
  userId: number,
  preferences: PrefUpdate[],
  global: GlobalSettings,
): Promise<void> {
  for (const p of preferences) {
    const t = await repo.getType(p.type);
    if (!t) continue; // 알 수 없는 종류 무시
    if (t.is_mandatory && (!p.inApp || !p.email)) {
      const err = new Error(`필수 알림(${p.type})은 비활성화할 수 없습니다`) as Error & { code?: string };
      err.code = 'MANDATORY_PREF';
      throw err;
    }
    await repo.upsertPref({ userId, type: p.type, inApp: p.inApp, email: p.email, push: p.push });
  }
  await repo.upsertSettings({
    userId,
    dndEnabled: global.dndEnabled,
    quietStart: global.quietStart.length === 5 ? `${global.quietStart}:00` : global.quietStart,
    quietEnd: global.quietEnd.length === 5 ? `${global.quietEnd}:00` : global.quietEnd,
    timezone: global.timezone,
  });
}

export { DEFAULT_SETTINGS };
