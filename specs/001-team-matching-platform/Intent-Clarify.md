# Intent - Clarify

**Run**: 2026-05-22
**Resolves**: CQ-01, CQ-02, CQ-03 in [spec.md](./spec.md) §3.2

## 결정 요약

| ID | 주제 | 채택안 | 영향 |
|---|---|---|---|
| **CQ-01** | 매칭 진입점 | **혼합형** (학생 자율 + 수업 연계) | `Role = {Student, Professor, Admin}` · `Project.type ∈ {자율, 공모전, 수업}` · 교수 승인 큐 추가 · 자동/반자동 매칭 분기 |
| **CQ-02** | 학생 신분 검증 | **이메일 도메인(.ac.kr) + 학생증 업로드 2단계** | 이메일 OTP/링크 → 학생증 사본 업로드 + 수동/OCR 승인 · 미승인은 매칭 후보 제외 · 학생증 이미지 암호화 저장 + 승인 후 N일 폐기 |
| **CQ-03** | 외부 도구 수집 범위 | **최대 집합** (메타+본문 분석) | OAuth 동의 화면 항목별 명시 · 본문 분석 후 즉시 폐기(또는 단기 보관 옵트인) · DSR 30일 SLA · PIA 위험도 초과 시 자동 다운그레이드 스위치 |

## 후속 액션

- [ ] `plan.md` — Role/권한 모델, 인증 시퀀스, 외부 도구 수집 파이프라인 섹션 재검토
- [ ] `data-model.md` — `User.role` enum, `Project.type` enum, `IdentityVerification` 엔티티, `ConsentScope` 엔티티 추가 여부 검토
- [ ] `contracts/openapi.yaml` — `/auth/student-card`, `/admin/student-card/approve`, OAuth 동의 범위 파라미터 반영
- [ ] `tasks.md` — Phase 3 (US1) 에 학생증 업로드/승인 흐름 태스크 추가, Phase 7 (US5) 본문 분석 파이프라인 명시
