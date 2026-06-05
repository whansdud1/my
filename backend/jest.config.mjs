// 002/003 — Jest(ESM) 설정.
// 프로젝트가 NodeNext ESM(.js import 스펙)이라 ts-jest ESM 프리셋 + .js→실제 모듈 매핑 필요.
export default {
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    // 소스가 사용하는 '../foo.js' 스타일 상대 import를 TS 원본으로 해석
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        useESM: true,
        // 타입체크 없이 트랜스파일만(isolatedModules) — strict 프로젝트의 교차 파일 타입 에러 회피, 속도↑
        tsconfig: {
          module: 'ESNext',
          moduleResolution: 'Bundler',
          verbatimModuleSyntax: false,
          isolatedModules: true,
        },
      },
    ],
  },
  testMatch: ['**/tests/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  clearMocks: true,
};
