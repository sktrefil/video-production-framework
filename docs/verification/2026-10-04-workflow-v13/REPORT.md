# Workflow v1.3 검증 기록

기록일: 2026-10-04. 작업 단계: 2단계(검증 기록 저장).

## 결론과 범위

대화에서 확인한 전체 타입 검사, 빌드, 전체 테스트, SHORTFORM/LONGFORM E2E 및 pilot-readiness 결과는 통과다. 실행 주체와 증거의 범위는 아래 표에 구분했다. 이 기록은 프로젝트의 제작 승인이나 파일럿 실행 승인이 아니며, 대상 프로젝트의 게이트·리소스 pin·산출물 유효성은 아직 조회하지 않았다.

## 검증 결과

| 실행 주체 | 검증 | 결과 | 증거 및 한계 |
|---|---|---|---|
| Codex | `npm run typecheck` | 종료 코드 0 | [로그](evidence/agent-typecheck.log). 종료 코드는 도구 실행 결과에서 확인했다. |
| Codex | production-spec 동일 프로세스 테스트 | 66/66 통과 | [로그](evidence/agent-production-spec.log). 임시 TypeScript 로더와 `--test-isolation=none` 사용. |
| Codex | workflow-v1.3 동일 프로세스 테스트 | 4/4 통과 | [로그](evidence/agent-workflow-v13.log). `node --test --test-isolation=none tests/workflow-v13.test.mjs`. |
| Codex | CLI 동일 프로세스 테스트 | 111 통과, 10 실패 | [로그](evidence/agent-cli-environment-failures.log). 하위 프로세스 생성 제한 및 그에 따른 런타임 사전 검사 실패. 전체 통과 기록으로 취급하지 않는다. |
| 사용자 일반 PowerShell | `npm test --workspace @vpf/cli` | 121/121 통과 | [첨부 원문](evidence/user-cli-pass.txt). 앞서 실패했던 테스트도 통과했다. |
| 사용자 일반 PowerShell | `npm test` | 마지막 검사까지 정상 완료 확인 | [첨부 원문](evidence/user-full-test-tail.txt). 로그는 CLI 테스트 중간부터 시작한다. CLI 121/121, production-spec 66/66, editor-app 125/125와 브라우저·실제 MP4 렌더·repository-boundary PASS가 포함된다. 전체 명령의 시작 부분 및 모든 테스트 총합은 이 발췌로 확인할 수 없다. |
| 사용자 일반 PowerShell | `npm run check:e2e` | MIG-12 PASS | [첨부 원문](evidence/user-e2e-pass.txt). SHORTFORM/LONGFORM 모두 materialized, deliveryReady, publishHandoffReady=true. 실제 MP4 렌더 포함. |
| 사용자 일반 PowerShell | `npm run check:pilot-readiness` | 전체 빌드 후 PASS | 대화 본문에 붙여 넣은 출력에서 확인. 별도 원문 첨부 파일은 없다. 최종 출력: `[pilot-readiness] PASS · runbooks/checklist/failure-map + env/project preflight`. |

E2E 세부 범위: `projectDbCount=2`, `oldRepoOperationalCalls=0`, `legacyResourceAccesses=0`. `staleGateVerified`는 SHORTFORM=true, LONGFORM=false다. 따라서 이 실행으로 LONGFORM의 stale gate까지 검증됐다고 주장하지 않는다. 테스트 fixture 성공을 실프로젝트의 현재 승인 상태로 대체하지 않는다.

## 코드 상태와 provenance

- 기준 HEAD: `2fe97b0c29462940a3c71c3f965a007daa715952`.
- 미커밋 작업 트리 변경을 대상으로 검증이 진행됐다. HEAD만으로 검증 대상 전체를 재현할 수 없다.
- [snapshot.json](snapshot.json)에 보고서 작성 시점의 변경 파일 12개, 새 리소스 2개 및 복사한 증거 파일의 SHA-256을 기록했다.
- 이 snapshot은 **현재 상태**다. 사용자 터미널 검증 시점에는 별도 소스 해시가 기록되지 않았으므로, 과거 실행과 현재 파일의 바이트 단위 일치를 소급 확정하지 않는다.
- 주요 변경: 한·영 9개 연출 필드의 생성 지시 차단, Compiler V2 검사, SC02/SC06 stale 지도 문구 회귀 보호, 이미지 없는 연속 클립 reference 검증, T050/T060 판단 기준 명시, 동일 attempt RETRY 지시 전달, 문서·회귀 테스트 갱신.
- 별도 변경: 채널 프로필 1.9.0과 Visual Bible 1.3.0 추가, `.gitignore`의 `apps\editor\build` 중복 항목. 프로젝트에 새 리소스가 적용됐다는 의미는 아니다.
- 루트의 `.tmp-workflow-*` 로그와 임시 로더는 검증 보조 파일이다. 증거는 이 디렉터리에 복사했으며 원본 삭제나 Git 커밋은 하지 않았다.

## 남은 확인 사항

1. 3단계: 대상 프로젝트를 특정하고 `project.db`를 읽어 T010~T100 상태, attempt, 승인/반려 사유, revision/hash와 리소스 pin을 확인한다.
2. 새 Visual Bible이 현재 HISTORY_MYSTERY 비실사 스타일 잠금과 일치하는지, 실제 프로젝트에 어떤 버전이 고정되어 있는지 확인한다. 테스트 PASS만으로 스타일 적합성을 확정하지 않는다.
3. 4단계: 현재 게이트와 산출물 유효성을 근거로 시작·재개 단계와 실행 명령을 결정한다.

이번 단계에서는 production gate, 프로젝트 DB, 생성 미디어를 변경하지 않았다.
