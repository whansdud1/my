// 002-notification-system — T029
// preferenceService 단위 테스트: 기본값 적용 · is_mandatory 강제 · 필수 비활성 거부(FR-C3).
// 리포지토리를 모킹해 DB 없이 도메인 로직만 검증한다(ESM: unstable_mockModule).
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const getType = jest.fn<(code: string) => Promise<unknown>>();
const getPref = jest.fn<(u: number, t: string) => Promise<unknown>>();
const listTypes = jest.fn<() => Promise<unknown[]>>();
const getPrefs = jest.fn<(u: number) => Promise<unknown[]>>();
const getSettings = jest.fn<(u: number) => Promise<unknown>>();
const upsertPref = jest.fn<(p: unknown) => Promise<void>>();
const upsertSettings = jest.fn<(s: unknown) => Promise<void>>();

jest.unstable_mockModule('../../src/repositories/notifications.js', () => ({
  getType,
  getPref,
  listTypes,
  getPrefs,
  getSettings,
  upsertPref,
  upsertSettings,
}));

const prefs = await import('../../src/services/notification/preferences.js');

const mandatory = (code: string) => ({ code, default_priority: 'CRITICAL', default_audience: 'INDIVIDUAL', is_mandatory: 1 });
const optional = (code: string) => ({ code, default_priority: 'NORMAL', default_audience: 'INDIVIDUAL', is_mandatory: 0 });

beforeEach(() => {
  upsertPref.mockResolvedValue(undefined);
  upsertSettings.mockResolvedValue(undefined);
});

describe('effectiveFor', () => {
  it('필수 종류는 사용자 설정과 무관하게 인앱+이메일 강제(FR-C3)', async () => {
    getType.mockResolvedValue(mandatory('SYSTEM'));
    // 사용자가 모두 꺼두었더라도
    getPref.mockResolvedValue({ user_id: 1, type: 'SYSTEM', in_app: 0, email: 0, push: 0 });

    const eff = await prefs.effectiveFor(1, 'SYSTEM');
    expect(eff).toEqual({ type: 'SYSTEM', inApp: true, email: true, push: false, mandatory: true });
  });

  it('설정 행이 없으면 기본값(인앱·이메일 on, 푸시 off)을 적용한다', async () => {
    getType.mockResolvedValue(optional('MATCH_READY'));
    getPref.mockResolvedValue(null);

    const eff = await prefs.effectiveFor(1, 'MATCH_READY');
    expect(eff).toEqual({ type: 'MATCH_READY', inApp: true, email: true, push: false, mandatory: false });
  });

  it('비필수 종류는 사용자 설정(tinyint 0/1)을 그대로 반영한다', async () => {
    getType.mockResolvedValue(optional('SCHEDULE_CHANGE'));
    getPref.mockResolvedValue({ user_id: 1, type: 'SCHEDULE_CHANGE', in_app: 1, email: 0, push: 1 });

    const eff = await prefs.effectiveFor(1, 'SCHEDULE_CHANGE');
    expect(eff).toEqual({ type: 'SCHEDULE_CHANGE', inApp: true, email: false, push: true, mandatory: false });
  });
});

describe('bundleFor', () => {
  it('전체 종류 × 사용자 설정을 합치고, 설정 행이 없으면 기본 글로벌 설정을 쓴다', async () => {
    listTypes.mockResolvedValue([mandatory('SYSTEM'), optional('MATCH_READY')]);
    getPrefs.mockResolvedValue([{ type: 'MATCH_READY', in_app: 1, email: 0, push: 0 }]);
    getSettings.mockResolvedValue(null);

    const bundle = await prefs.bundleFor(1);

    expect(bundle.preferences).toEqual([
      { type: 'SYSTEM', inApp: true, email: true, push: false, mandatory: true },
      { type: 'MATCH_READY', inApp: true, email: false, push: false, mandatory: false },
    ]);
    expect(bundle.global).toEqual(prefs.DEFAULT_SETTINGS);
  });

  it('설정 행이 있으면 TIME(HH:MM:SS)을 HH:MM 으로 잘라 반환한다', async () => {
    listTypes.mockResolvedValue([]);
    getPrefs.mockResolvedValue([]);
    getSettings.mockResolvedValue({
      user_id: 1,
      dnd_enabled: 1,
      quiet_start: '23:30:00',
      quiet_end: '07:00:00',
      timezone: 'Asia/Seoul',
    });

    const bundle = await prefs.bundleFor(1);
    expect(bundle.global).toEqual({
      dndEnabled: true,
      quietStart: '23:30',
      quietEnd: '07:00',
      timezone: 'Asia/Seoul',
    });
  });
});

describe('updateBundle', () => {
  const global = { dndEnabled: false, quietStart: '22:00', quietEnd: '08:00', timezone: 'Asia/Seoul' };

  it('필수 종류를 비활성(인앱/이메일 off)하려 하면 MANDATORY_PREF 로 거부한다', async () => {
    getType.mockResolvedValue(mandatory('SYSTEM'));

    await expect(
      prefs.updateBundle(1, [{ type: 'SYSTEM', inApp: false, email: true, push: false }], global),
    ).rejects.toMatchObject({ code: 'MANDATORY_PREF' });
    expect(upsertPref).not.toHaveBeenCalled();
  });

  it('알 수 없는 종류는 무시하고 나머지를 저장한다', async () => {
    getType.mockImplementation(async (code: string) => (code === 'KNOWN' ? optional('KNOWN') : null));

    await prefs.updateBundle(
      1,
      [
        { type: 'GHOST', inApp: true, email: true, push: false },
        { type: 'KNOWN', inApp: true, email: false, push: false },
      ],
      global,
    );

    expect(upsertPref).toHaveBeenCalledTimes(1);
    expect(upsertPref).toHaveBeenCalledWith({ userId: 1, type: 'KNOWN', inApp: true, email: false, push: false });
  });

  it('글로벌 설정 저장 시 HH:MM 을 HH:MM:SS 로 보정한다', async () => {
    getType.mockResolvedValue(optional('ANY'));

    await prefs.updateBundle(1, [], global);

    expect(upsertSettings).toHaveBeenCalledWith({
      userId: 1,
      dndEnabled: false,
      quietStart: '22:00:00',
      quietEnd: '08:00:00',
      timezone: 'Asia/Seoul',
    });
  });
});
