// 평가 리뷰 텍스트 악성 탐지 — 규칙기반 1차 필터(한국어 욕설·모욕·인격모독).
//
// 우회(spacing/특수문자/반복문자) 탐지를 위해 입력을 정규화한 뒤 사전과 대조한다.
// 사전은 baseline 이며 운영에서 계속 확장하는 것을 전제로 한다.

export type ToxicSeverity = 'none' | 'mild' | 'severe';
export type ToxicCategory = 'profanity' | 'insult' | 'sexual' | 'threat' | 'discrimination';

export interface LexiconHit {
  term: string;
  severity: ToxicSeverity;
  category: ToxicCategory;
}

interface LexEntry {
  // 정규화된 텍스트에서 찾을 부분 문자열(이미 정규화 규칙을 거친 형태로 작성).
  needle: string;
  severity: Exclude<ToxicSeverity, 'none'>;
  category: ToxicCategory;
}

// severe = 즉시 차단 후보, mild = 검토 큐 후보.
const LEXICON: LexEntry[] = [
  // --- 욕설(profanity) : severe ---
  { needle: '시발', severity: 'severe', category: 'profanity' },
  { needle: '씨발', severity: 'severe', category: 'profanity' },
  { needle: '씨바', severity: 'severe', category: 'profanity' },
  { needle: '시바', severity: 'severe', category: 'profanity' },
  { needle: '씨팔', severity: 'severe', category: 'profanity' },
  { needle: '좆', severity: 'severe', category: 'profanity' },
  { needle: '존나', severity: 'mild', category: 'profanity' },
  { needle: '졸라', severity: 'mild', category: 'profanity' },
  { needle: '지랄', severity: 'severe', category: 'profanity' },
  { needle: '개새끼', severity: 'severe', category: 'insult' },
  { needle: '개색기', severity: 'severe', category: 'insult' },
  { needle: '새끼', severity: 'severe', category: 'insult' },
  { needle: '새기', severity: 'mild', category: 'insult' },
  { needle: '병신', severity: 'severe', category: 'insult' },
  { needle: '븅신', severity: 'severe', category: 'insult' },
  { needle: 'etlqkf', severity: 'severe', category: 'profanity' }, // "시발" 영타
  { needle: '닥쳐', severity: 'mild', category: 'insult' },
  { needle: '꺼져', severity: 'mild', category: 'insult' },
  { needle: '엿먹어', severity: 'mild', category: 'insult' },
  // --- 인격 모독(insult) ---
  { needle: '멍청이', severity: 'mild', category: 'insult' },
  { needle: '멍청', severity: 'mild', category: 'insult' },
  { needle: '바보', severity: 'mild', category: 'insult' },
  { needle: '쓰레기', severity: 'severe', category: 'insult' },
  { needle: '한심', severity: 'mild', category: 'insult' },
  { needle: '무능', severity: 'mild', category: 'insult' },
  { needle: '벌레', severity: 'mild', category: 'insult' },
  { needle: '인간쓰레기', severity: 'severe', category: 'insult' },
  // --- 위협(threat) ---
  { needle: '죽여', severity: 'severe', category: 'threat' },
  { needle: '죽어', severity: 'mild', category: 'threat' },
  { needle: '때려', severity: 'mild', category: 'threat' },
  // --- 차별(discrimination) ---
  { needle: '장애인', severity: 'mild', category: 'discrimination' },
];

// 정규화: 소문자화, NFC, 제로폭/공백/구두점·특수문자 제거, 반복문자 축약.
// 예) "시 발", "시*발", "시이이발" → "시발" 류로 수렴시킨다.
export function normalizeForLexicon(input: string): string {
  let s = input.normalize('NFC').toLowerCase();
  // 제로폭 문자 제거
  s = s.replace(/[​-‏﻿]/g, '');
  // 한글/영문/숫자 외 모두 제거(공백·구두점·이모지·특수문자로 글자를 끊는 우회 차단)
  s = s.replace(/[^0-9a-z가-힣]/g, '');
  // 3회 이상 반복 문자를 1회로 축약("시이이발" → "시발"은 어려우나 "ㅅㅅㅅ" 류 축약)
  s = s.replace(/(.)\1{2,}/g, '$1');
  return s;
}

// 정규화된 텍스트를 사전과 대조해 적중 목록을 돌려준다.
export function scanLexicon(raw: string): LexiconHit[] {
  const norm = normalizeForLexicon(raw);
  const hits: LexiconHit[] = [];
  const seen = new Set<string>();
  for (const e of LEXICON) {
    if (norm.includes(e.needle) && !seen.has(e.needle)) {
      seen.add(e.needle);
      hits.push({ term: e.needle, severity: e.severity, category: e.category });
    }
  }
  return hits;
}
