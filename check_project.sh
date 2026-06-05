#!/usr/bin/env bash
# ============================================================================
# check_project.sh — UniTeam(mis2601) 로컬 서비스 관리 스크립트
#
#   사용법:  ./check_project.sh {start|stop|restart|status}
#
#   관리 대상 (3 컴포넌트):
#     - MySQL   127.0.0.1:3307   (포터블 MySQL 8.4.5, ~/uniteam-db)
#     - Backend 127.0.0.1:9538   (Express, tsx watch)
#     - Frontend          :9518  (Vite dev server)
#
#   * 3306은 타 사용자가 점유 중이라 DB는 3307 사용 (backend/.env 와 일치)
# ============================================================================
set -uo pipefail

# --- 경로/포트 설정 -----------------------------------------------------------
PROJECT_DIR="${PROJECT_DIR:-$HOME/mis2601}"

DB_HOME="$HOME/uniteam-db"
DB_BASE="$DB_HOME/mysql"
DB_DATA="$DB_HOME/data"
DB_SOCK="$DB_HOME/mysql.sock"
DB_PIDFILE="$DB_HOME/mysqld.pid"
DB_LOG="$DB_HOME/mysqld.log"
DB_PORT=3307

BE_PORT=9538
FE_PORT=9518
BE_LOG="/tmp/uniteam-backend.log"
FE_LOG="/tmp/uniteam-frontend.log"

RUN_DIR="$DB_HOME/run"
mkdir -p "$RUN_DIR"

# --- 색상 --------------------------------------------------------------------
if [ -t 1 ]; then G=$'\033[32m'; R=$'\033[31m'; Y=$'\033[33m'; B=$'\033[1m'; N=$'\033[0m'
else G=''; R=''; Y=''; B=''; N=''; fi
ok()   { echo "  ${G}✓${N} $*"; }
warn() { echo "  ${Y}•${N} $*"; }
err()  { echo "  ${R}✗${N} $*"; }

# --- 공통 유틸 ---------------------------------------------------------------
port_up() { lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }

# 포트 LISTEN 프로세스 PID
port_pids() { lsof -nP -iTCP:"$1" -sTCP:LISTEN -t 2>/dev/null; }

# 프로세스 트리(자식 먼저) 종료
kill_tree() {
  local pid="$1"; [ -z "$pid" ] && return 0
  local kid
  for kid in $(pgrep -P "$pid" 2>/dev/null); do kill_tree "$kid"; done
  kill "$pid" 2>/dev/null || true
}

# 포트가 내려갈 때까지 대기 (최대 N초)
wait_down() { local p="$1" n="${2:-15}"; for _ in $(seq 1 "$n"); do port_up "$p" || return 0; sleep 1; done; return 1; }
# 포트가 올라올 때까지 대기 (최대 N초)
wait_up()   { local p="$1" n="${2:-30}"; for _ in $(seq 1 "$n"); do port_up "$p" && return 0; sleep 1; done; return 1; }

# ============================================================================
# MySQL
# ============================================================================
start_db() {
  if port_up "$DB_PORT"; then ok "MySQL  이미 실행 중 (:$DB_PORT)"; return 0; fi
  if [ ! -x "$DB_BASE/bin/mysqld" ]; then err "MySQL 바이너리 없음: $DB_BASE/bin/mysqld"; return 1; fi
  if [ ! -d "$DB_DATA/mysql" ]; then err "datadir 미초기화: $DB_DATA (최초 1회 mysqld --initialize-insecure 필요)"; return 1; fi
  nohup "$DB_BASE/bin/mysqld" --no-defaults \
    --basedir="$DB_BASE" --datadir="$DB_DATA" \
    --bind-address=127.0.0.1 --port="$DB_PORT" \
    --socket="$DB_SOCK" --mysqlx=OFF --pid-file="$DB_PIDFILE" \
    > "$DB_LOG" 2>&1 &
  if wait_up "$DB_PORT" 30; then ok "MySQL  기동 (:$DB_PORT)"; else err "MySQL 기동 실패 — $DB_LOG 확인"; return 1; fi
}

stop_db() {
  if ! port_up "$DB_PORT" && [ ! -f "$DB_PIDFILE" ]; then warn "MySQL  미실행"; return 0; fi
  # graceful: 소켓으로 root(빈 암호) shutdown
  "$DB_BASE/bin/mysqladmin" --no-defaults --socket="$DB_SOCK" -u root shutdown 2>/dev/null \
    || { [ -f "$DB_PIDFILE" ] && kill "$(cat "$DB_PIDFILE")" 2>/dev/null; } \
    || true
  if wait_down "$DB_PORT" 20; then ok "MySQL  종료"; else err "MySQL 종료 실패 (:$DB_PORT 아직 LISTEN)"; return 1; fi
}

# ============================================================================
# Backend / Frontend (npm dev 서버)
# ============================================================================
# $1=이름 $2=포트 $3=pidfile $4=로그 $5..=실행커맨드
_start_node() {
  local name="$1" port="$2" pidfile="$3" log="$4"; shift 4
  if port_up "$port"; then ok "$name 이미 실행 중 (:$port)"; return 0; fi
  ( cd "$PROJECT_DIR" && nohup "$@" > "$log" 2>&1 & echo $! > "$pidfile" )
  if wait_up "$port" 30; then ok "$name 기동 (:$port)"; else err "$name 기동 실패 — $log 확인"; return 1; fi
}

# $1=이름 $2=포트 $3=pidfile $4=패턴
_stop_node() {
  local name="$1" port="$2" pidfile="$3" pat="$4"
  if ! port_up "$port" && [ ! -f "$pidfile" ]; then warn "$name 미실행"; return 0; fi
  # 1) 저장된 부모 PID 트리 종료 (tsx watch/vite 의 watcher 가 자식 재기동하는 것 방지)
  [ -f "$pidfile" ] && kill_tree "$(cat "$pidfile")"
  # 2) 패턴 기반 잔여 프로세스 정리
  [ -n "$pat" ] && pkill -f "$pat" 2>/dev/null || true
  # 3) 그래도 남은 포트 점유 프로세스 정리
  local pids; pids="$(port_pids "$port")"; [ -n "$pids" ] && kill $pids 2>/dev/null || true
  rm -f "$pidfile"
  if wait_down "$port" 15; then ok "$name 종료"; else err "$name 종료 실패 (:$port 아직 LISTEN)"; return 1; fi
}

start_backend()  { _start_node "Backend " "$BE_PORT" "$RUN_DIR/backend.pid"  "$BE_LOG" npm --prefix backend  run dev; }
start_frontend() { _start_node "Frontend" "$FE_PORT" "$RUN_DIR/frontend.pid" "$FE_LOG" npm --prefix frontend run dev; }
stop_backend()   { _stop_node  "Backend " "$BE_PORT" "$RUN_DIR/backend.pid"  "tsx watch src/server.ts"; }
stop_frontend()  { _stop_node  "Frontend" "$FE_PORT" "$RUN_DIR/frontend.pid" "$PROJECT_DIR/frontend/node_modules/.*vite"; }

# ============================================================================
# 상태 점검
# ============================================================================
_probe() { # $1=label $2=url
  local code; code=$(curl -s -o /dev/null -m 6 -w "%{http_code}" "$2" 2>/dev/null)
  if [ "$code" = "200" ]; then ok "$1 — HTTP $code"; else err "$1 — HTTP ${code:-no-response}"; fi
}

status() {
  echo "${B}● 포트${N}"
  for pp in "MySQL:$DB_PORT" "Backend:$BE_PORT" "Frontend:$FE_PORT"; do
    local nm="${pp%%:*}" pt="${pp##*:}"
    if port_up "$pt"; then ok "$nm (:$pt) LISTEN"; else err "$nm (:$pt) DOWN"; fi
  done
  echo "${B}● HTTP${N}"
  _probe "Frontend  http://localhost:$FE_PORT/"            "http://localhost:$FE_PORT/"
  _probe "Backend   /api/v1/health"                        "http://localhost:$BE_PORT/api/v1/health"
  _probe "Public    https://p18.sumzip.com/"               "https://p18.sumzip.com/"
  echo "${B}● Readiness (DB 연결)${N}"
  local r; r=$(curl -s -m 6 "http://localhost:$BE_PORT/api/v1/health/ready" 2>/dev/null)
  if echo "$r" | grep -q '"READY"'; then ok "DB READY — $r"; else err "DB NOT READY — ${r:-no-response}"; fi
}

# ============================================================================
# 디스패치
# ============================================================================
do_start()   { echo "${B}▶ start${N}";   start_db && start_backend && start_frontend; }
do_stop()    { echo "${B}■ stop${N}";    stop_frontend; stop_backend; stop_db; }
do_restart() { echo "${B}↻ restart${N}"; do_stop; echo; do_start; }

case "${1:-}" in
  start)   do_start ;;
  stop)    do_stop ;;
  restart) do_restart ;;
  status)  status ;;
  *)
    echo "사용법: $0 {start|stop|restart|status}"
    echo "  start    MySQL(:$DB_PORT) → Backend(:$BE_PORT) → Frontend(:$FE_PORT) 순차 기동"
    echo "  stop     역순 종료 (Frontend → Backend → MySQL)"
    echo "  restart  stop 후 start"
    echo "  status   포트·HTTP·DB readiness 점검"
    exit 2 ;;
esac
