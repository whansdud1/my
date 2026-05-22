import { config } from '../../config.js';
import { logger } from '../../lib/logger.js';

// 단순 SMTP 어댑터 — nodemailer 의존성을 추가하지 않고 logger 기반 stub.
// 운영 환경에서는 SES/SendGrid 어댑터로 교체.

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface EmailAdapter {
  send(msg: EmailMessage): Promise<void>;
}

class ConsoleAdapter implements EmailAdapter {
  async send(msg: EmailMessage): Promise<void> {
    logger.info(
      { adapter: 'console', to: msg.to, subject: msg.subject, from: config.smtp.from },
      'email send (stub)',
    );
    logger.debug({ html: msg.html }, 'email body');
  }
}

class MailHogAdapter implements EmailAdapter {
  async send(msg: EmailMessage): Promise<void> {
    // MailHog는 인증 없이 SMTP 1025를 수신 — 실제 발송은 nodemailer 도입 시 활성화
    // 1차 구현에서는 콘솔 로깅으로 대체하고, 운영 시점에 nodemailer 어댑터 추가
    logger.info(
      { adapter: 'mailhog', host: config.smtp.host, port: config.smtp.port, to: msg.to, subject: msg.subject },
      'email send (mailhog stub — install nodemailer to enable)',
    );
  }
}

let _adapter: EmailAdapter | null = null;
export function getEmailAdapter(): EmailAdapter {
  if (_adapter) return _adapter;
  _adapter = config.env === 'production' ? new ConsoleAdapter() : new MailHogAdapter();
  return _adapter;
}

// --- 메일 템플릿 ---
export function renderVerifyEmail(opts: { name: string; verifyUrl: string }): EmailMessage {
  const { name, verifyUrl } = opts;
  return {
    to: '',
    subject: '[UniTeam] 이메일 인증을 완료해주세요',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2>UniTeam 가입을 환영합니다, ${name}님</h2>
        <p>아래 버튼을 눌러 이메일 인증을 완료해주세요. 링크는 24시간 동안 유효합니다.</p>
        <p style="margin: 24px 0;">
          <a href="${verifyUrl}" style="display:inline-block; padding:10px 18px; background:#2563eb; color:#fff; border-radius:8px; text-decoration:none;">이메일 인증하기</a>
        </p>
        <p style="color:#6b7280; font-size: 0.85rem;">버튼이 작동하지 않으면 다음 링크를 복사하여 브라우저 주소창에 붙여넣어 주세요:<br/><code>${verifyUrl}</code></p>
      </div>
    `,
    text: `UniTeam 이메일 인증: ${verifyUrl}`,
  };
}

export function renderInviteEmail(opts: { recipientName: string; projectTitle: string; inviteUrl: string }): EmailMessage {
  return {
    to: '',
    subject: `[UniTeam] ${opts.projectTitle} 팀 초대`,
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2>${opts.recipientName}님, 프로젝트 초대가 도착했습니다</h2>
        <p><strong>${opts.projectTitle}</strong> 팀에 초대되었습니다.</p>
        <p style="margin: 24px 0;">
          <a href="${opts.inviteUrl}" style="display:inline-block; padding:10px 18px; background:#2563eb; color:#fff; border-radius:8px; text-decoration:none;">초대 확인하기</a>
        </p>
      </div>
    `,
  };
}
