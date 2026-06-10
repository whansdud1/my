import { test, expect, type Page, type BrowserContext } from '@playwright/test';

// 002-notification-system — T038 알림 E2E (Playwright)
// 흐름: 이벤트(수신) → 안읽음 배지 → 읽음 처리(개별·전체) → 알림 설정 반영.
//
// 전체 스택을 띄우지 않고 /api/v1/* 를 라우트 모킹해 프론트엔드 흐름만 검증한다.
// 서버 상태(읽음 카운트·설정)는 핸들러 클로저가 보관해 실제 백엔드처럼 상태 전이를 모사한다.
// (계약/통합/스토어 단위 테스트가 서버 측 권위를 별도 검증하므로, 여기서는 UI 흐름에 집중.)

const NOW = '2026-06-09T00:00:00.000Z';

interface ServerState {
  items: Array<{
    id: string;
    type: string;
    priority: 'critical' | 'normal' | 'info';
    title: string;
    body: string;
    deepLink: string | null;
    groupCount: number;
    status: 'unread' | 'read' | 'archived';
    createdAt: string;
    readAt: string | null;
  }>;
  prefs: {
    preferences: Array<{
      type: string;
      inApp: boolean;
      email: boolean;
      push: boolean;
      mandatory: boolean;
    }>;
    global: { dndEnabled: boolean; quietStart: string; quietEnd: string; timezone: string };
  };
}

function freshState(): ServerState {
  return {
    items: [
      {
        id: 'n1',
        type: 'TEAM_JOIN_REQUEST',
        priority: 'normal',
        title: '팀 합류 요청',
        body: '박지호님이 회원님 팀에 합류를 요청했습니다',
        deepLink: null,
        groupCount: 1,
        status: 'unread',
        createdAt: NOW,
        readAt: null,
      },
      {
        id: 'n2',
        type: 'MATCH_READY',
        priority: 'normal',
        title: '새 매칭 후보가 도착했습니다',
        body: '추천 팀원 3명이 준비되었습니다',
        deepLink: null,
        groupCount: 1,
        status: 'unread',
        createdAt: NOW,
        readAt: null,
      },
      {
        id: 'n3',
        type: 'SCHEDULE_CHANGE',
        priority: 'info',
        title: '회의 일정이 변경되었습니다',
        body: '화요일 20:00 → 21:00',
        deepLink: null,
        groupCount: 1,
        status: 'read',
        createdAt: NOW,
        readAt: NOW,
      },
    ],
    prefs: {
      preferences: [
        { type: 'MATCH_READY', inApp: true, email: false, push: false, mandatory: false },
        { type: 'TEAM_JOIN_REQUEST', inApp: true, email: true, push: false, mandatory: false },
        { type: 'SECURITY_ALERT', inApp: true, email: true, push: false, mandatory: true },
      ],
      global: { dndEnabled: false, quietStart: '22:00', quietEnd: '08:00', timezone: 'Asia/Seoul' },
    },
  };
}

function unreadOf(s: ServerState): number {
  return s.items.filter((n) => n.status === 'unread').length;
}

/** 인증 상태를 sessionStorage 에 심어 라우터 가드를 통과시킨다(실제 로그인 호출 없이). */
async function seedAuth(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const auth = {
      accessToken: 'e2e-fake-token',
      user: {
        id: 'u-e2e',
        email: 'minseo@uni.test',
        name: '김민서',
        role: 'STUDENT',
        emailVerified: true,
      },
    };
    // pinia-plugin-persistedstate (store id 'auth', storage: sessionStorage)
    sessionStorage.setItem('auth', JSON.stringify(auth));
    // services/api.ts 토큰 백업 키
    sessionStorage.setItem('uniteam.accessToken', 'e2e-fake-token');
  });
}

/** /api/v1/* 전체를 가로채 상태를 가진 가짜 백엔드처럼 응답한다. */
async function mockApi(page: Page, state: ServerState): Promise<void> {
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const method = req.method();
    // 응답 인터셉터가 envelope.data 만 언래핑하므로 {ok,data} 로 감싼다.
    const ok = (data: unknown) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, data }),
      });

    // 안읽음 카운트(폴링 + markRead 후 재조회)
    if (path.endsWith('/notifications/unread-count')) return ok({ unreadCount: unreadOf(state) });

    // 전체 읽음
    if (path.endsWith('/notifications/read-all') && method === 'POST') {
      const updated = state.items.filter((n) => n.status === 'unread').length;
      state.items.forEach((n) => {
        if (n.status === 'unread') {
          n.status = 'read';
          n.readAt = NOW;
        }
      });
      return ok({ updated });
    }

    // 개별 읽음 /notifications/:id/read
    const m = path.match(/\/notifications\/([^/]+)\/read$/);
    if (m && method === 'POST') {
      const it = state.items.find((n) => n.id === m[1]);
      if (it) {
        it.status = 'read';
        it.readAt = NOW;
      }
      return ok(it);
    }

    // 알림 설정 조회/저장
    if (path.endsWith('/notifications/preferences')) {
      if (method === 'PUT') {
        state.prefs = JSON.parse(req.postData() ?? '{}');
        return ok(state.prefs);
      }
      return ok(state.prefs);
    }

    // 알림 목록
    if (path.endsWith('/notifications')) {
      return ok({ items: state.items, nextCursor: null, unreadCount: unreadOf(state) });
    }

    // 그 외 호출(프로젝트 목록 등)은 빈 배열로 — 레이아웃 렌더만 보장하면 충분.
    return ok([]);
  });
}

test.describe('알림 시스템 E2E — 이벤트→수신→읽음→설정 반영', () => {
  let state: ServerState;

  test.beforeEach(async ({ context, page }) => {
    state = freshState();
    await seedAuth(context);
    await mockApi(page, state);
  });

  test('수신: 안읽음 알림이 벨 배지에 표시된다', async ({ page }) => {
    await page.goto('/projects');

    const badge = page.locator('.bell-wrap .badge');
    await expect(badge).toHaveText('2'); // n1, n2 unread
  });

  test('읽음: 알림을 열면 읽음 처리되고 배지가 감소한다', async ({ page }) => {
    await page.goto('/projects');

    // 벨 클릭 → 목록 드롭다운 열림(loadList)
    await page.getByRole('button', { name: /알림/ }).click();
    const panel = page.locator('.panel');
    await expect(panel).toBeVisible();

    // 안읽음 항목 2건 확인 후 첫 항목 클릭 → 읽음 처리
    const unreadItems = panel.locator('.item.unread');
    await expect(unreadItems).toHaveCount(2);
    await unreadItems.first().click();

    // 배지가 1로 감소하고, 안읽음 항목도 1건으로 줄어든다.
    await expect(page.locator('.bell-wrap .badge')).toHaveText('1');
    await expect(panel.locator('.item.unread')).toHaveCount(1);
  });

  test('전체 읽음: 모두 읽음 처리되면 배지가 사라진다', async ({ page }) => {
    await page.goto('/projects');
    await page.getByRole('button', { name: /알림/ }).click();
    await expect(page.locator('.panel')).toBeVisible();

    await page.getByRole('button', { name: '전체 읽음' }).click();

    await expect(page.locator('.bell-wrap .badge')).toHaveCount(0);
    await expect(page.locator('.panel .item.unread')).toHaveCount(0);
  });

  test('설정 반영: 채널을 토글·저장하면 재진입 후에도 유지된다', async ({ page }) => {
    await page.goto('/settings/notifications');

    // 매칭 완료 행의 이메일 채널(초기 false) → 체크
    const row = page.locator('table.prefs tbody tr', { hasText: '매칭 완료' });
    const emailToggle = row.locator('td:nth-child(3) input[type="checkbox"]');
    await expect(emailToggle).not.toBeChecked();
    await emailToggle.check();

    // 저장 → PUT 요청 본문에 변경이 반영되었는지 확인
    const [putReq] = await Promise.all([
      page.waitForRequest(
        (r) => r.url().includes('/notifications/preferences') && r.method() === 'PUT',
      ),
      page.getByRole('button', { name: '저장' }).click(),
    ]);
    const sent = JSON.parse(putReq.postData() ?? '{}');
    const matchPref = sent.preferences.find((p: { type: string }) => p.type === 'MATCH_READY');
    expect(matchPref.email).toBe(true);

    // 저장 성공 토스트
    await expect(page.locator('.toast.success')).toContainText('알림 설정이 저장되었습니다');

    // 재진입(reload) → 서버 상태가 갱신되어 체크가 유지된다(= 설정 반영).
    await page.reload();
    const emailToggleAfter = page
      .locator('table.prefs tbody tr', { hasText: '매칭 완료' })
      .locator('td:nth-child(3) input[type="checkbox"]');
    await expect(emailToggleAfter).toBeChecked();
  });
});
