import type { Knex } from 'knex';

const SEEDS: Array<{ domain: string; label: string }> = [
  { domain: 'ac.kr', label: '대한민국 대학(.ac.kr)' },
  { domain: 'edu', label: '미국 교육기관(.edu)' },
  { domain: 'ed.jp', label: '일본 교육기관' },
  { domain: 'edu.au', label: '호주 대학' },
  { domain: 'ac.uk', label: '영국 대학' },
];

export async function seed(knex: Knex): Promise<void> {
  // upsert — 기존 도메인은 유지
  for (const s of SEEDS) {
    await knex.raw(
      `INSERT INTO domain_whitelist (domain, label, enabled) VALUES (?, ?, TRUE)
       ON DUPLICATE KEY UPDATE label = VALUES(label)`,
      [s.domain, s.label],
    );
  }
}
