import { logger } from '../../lib/logger.js';
import { getEmailAdapter } from '../../adapters/email/index.js';
import { getPool } from '../../db/connection.js';
import type { Channel, NotificationRow } from '../../repositories/notifications.js';

// 002-notification-system — T013/T026/T035 채널 어댑터
// Channel 인터페이스로 인앱/이메일/푸시를 추상화. 서비스는 채널 구현을 모른다.

export interface DeliveryContext {
  notification: NotificationRow;
  recipientEmail: string | null;
}

export interface NotificationChannel {
  readonly key: Channel;
  send(ctx: DeliveryContext): Promise<void>; // 실패 시 throw → 워커가 재시도
}

// IN_APP: 이미 notifications 행으로 보존됨. 별도 전송 작업 없음(항상 성공, FR-B2).
class InAppChannel implements NotificationChannel {
  readonly key = 'IN_APP' as const;
  async send(_ctx: DeliveryContext): Promise<void> {
    // no-op: 인앱은 DB 보존이 곧 전달.
  }
}

// EMAIL: 외부 메일 어댑터로 위임. 연락처 유효성 검사(EC-07).
class EmailChannel implements NotificationChannel {
  readonly key = 'EMAIL' as const;
  async send(ctx: DeliveryContext): Promise<void> {
    const to = ctx.recipientEmail;
    if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
      const err = new Error('수신자 이메일이 유효하지 않습니다') as Error & { suppress?: boolean };
      err.suppress = true; // 재시도 무의미 → 워커가 SUPPRESSED 처리
      throw err;
    }
    const n = ctx.notification;
    await getEmailAdapter().send({
      to,
      subject: `[UniTeam] ${n.title}`,
      html: `<div style="font-family:-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
        <h2 style="font-size:1.1rem;">${escapeHtml(n.title)}</h2>
        <p style="color:#374151;">${escapeHtml(n.body)}</p>
        ${n.deep_link ? `<p style="margin-top:16px;"><a href="${n.deep_link}" style="color:#2563eb;">자세히 보기</a></p>` : ''}
      </div>`,
      text: `${n.title}\n\n${n.body}${n.deep_link ? `\n\n${n.deep_link}` : ''}`,
    });
  }
}

// PUSH: WA-01 — 1차 비활성 스텁. 인터페이스만 확정, 환경 토글로 추후 활성화.
class PushChannel implements NotificationChannel {
  readonly key = 'PUSH' as const;
  private enabled = process.env.NOTIF_PUSH_ENABLED === 'true';
  async send(ctx: DeliveryContext): Promise<void> {
    if (!this.enabled) {
      logger.debug({ notificationId: ctx.notification.id }, 'push channel disabled (WA-01) — skipped');
      return; // 비활성 시 성공 처리(실제 발송 없음)
    }
    // TODO: Web Push(VAPID) 발송 — 2차.
    logger.info({ notificationId: ctx.notification.id }, 'push send (stub)');
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

const REGISTRY: Record<Channel, NotificationChannel> = {
  IN_APP: new InAppChannel(),
  EMAIL: new EmailChannel(),
  PUSH: new PushChannel(),
};

export function getChannel(key: Channel): NotificationChannel {
  return REGISTRY[key];
}

// 수신자 이메일 조회 (EC-07 검증용)
export async function lookupRecipientEmail(userId: number): Promise<string | null> {
  const [rows] = (await getPool().query(`SELECT email FROM users WHERE id = ? LIMIT 1`, [userId])) as unknown as [
    Array<{ email: string }>,
  ];
  return rows[0]?.email ?? null;
}
