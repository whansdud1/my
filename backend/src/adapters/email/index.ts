import nodemailer, { type Transporter } from 'nodemailer';
import { config } from '../../config.js';
import { logger } from '../../lib/logger.js';

// nodemailer 기반 SMTP 어댑터.
// - 개발: MailHog 등 무인증 SMTP(127.0.0.1:1025)로 발송, SMTP 미가동이면 콘솔로 폴백.
// - 운영: SMTP_USER/SMTP_PASS(SES·SendGrid·Gmail 등) 설정 시 실제 발송.

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface EmailAdapter {
  send(msg: EmailMessage): Promise<void>;
}

// SMTP 미설정/연결 실패 시 폴백 — 메일 내용을 로그로 남겨 인증 링크 확인 가능.
class ConsoleAdapter implements EmailAdapter {
  constructor(private reason?: string) {}
  async send(msg: EmailMessage): Promise<void> {
    logger.warn(
      { adapter: 'console', to: msg.to, subject: msg.subject, from: config.smtp.from, reason: this.reason },
      'email send (콘솔 폴백 — 실제 SMTP 미발송)',
    );
    logger.info({ to: msg.to, text: msg.text }, 'email body (text)');
  }
}

class SmtpAdapter implements EmailAdapter {
  private transporter: Transporter;
  constructor() {
    const auth =
      config.smtp.user && config.smtp.pass
        ? { user: config.smtp.user, pass: config.smtp.pass }
        : undefined;
    this.transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth,
      // MailHog 등 무인증 SMTP에서는 STARTTLS 미요구.
      requireTLS: !!auth && !config.smtp.secure,
    });
  }

  async send(msg: EmailMessage): Promise<void> {
    const info = await this.transporter.sendMail({
      from: config.smtp.from,
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
    });
    logger.info(
      { adapter: 'smtp', host: config.smtp.host, port: config.smtp.port, to: msg.to, messageId: info.messageId },
      'email sent',
    );
  }
}

// SMTP 발송을 시도하되, 전송 실패 시 콘솔 폴백으로 회원가입 흐름이 막히지 않도록 감싼다.
class ResilientAdapter implements EmailAdapter {
  private smtp = new SmtpAdapter();
  private fallback = new ConsoleAdapter('smtp send failed');
  async send(msg: EmailMessage): Promise<void> {
    try {
      await this.smtp.send(msg);
    } catch (err) {
      logger.error({ err, to: msg.to }, 'SMTP 발송 실패 — 콘솔 폴백으로 전환');
      await this.fallback.send(msg);
    }
  }
}

let _adapter: EmailAdapter | null = null;
export function getEmailAdapter(): EmailAdapter {
  if (_adapter) return _adapter;
  // SMTP 호스트가 설정돼 있으면 실제 발송(실패 시 폴백), 아니면 콘솔.
  _adapter = config.smtp.host ? new ResilientAdapter() : new ConsoleAdapter('SMTP_HOST 미설정');
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
