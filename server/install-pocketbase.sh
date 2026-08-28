#!/usr/bin/env bash
#
# 가비아 클라우드 서버(Ubuntu/Debian)에 PocketBase를 올린다.
#
# 서버에 ssh로 들어가서 실행한다:
#   sudo bash install-pocketbase.sh
#
# 하는 일은 넷뿐이다 — 내려받기, 자리 만들기, systemd 등록, 스왑 확보.
# nginx와 인증서는 도메인마다 달라서 따로 한다(README 참고).
#
# 여러 번 실행해도 안전하다. 이미 있는 것은 건드리지 않는다.

set -euo pipefail

# ────────────────────────────── 설정 ──────────────────────────────

# 최신 판은 https://github.com/pocketbase/pocketbase/releases 에서 확인한다.
PB_VERSION="${PB_VERSION:-0.28.4}"
PB_DIR="/opt/pocketbase"
PB_USER="pocketbase"
# 바깥에 직접 열지 않는다. nginx만 이리로 들여보낸다.
PB_BIND="127.0.0.1:8090"

log() { printf '\n\033[1m▸ %s\033[0m\n' "$1"; }

if [[ $EUID -ne 0 ]]; then
  echo "sudo로 실행하세요: sudo bash $0" >&2
  exit 1
fi

# ─────────────────────── 스왑 (메모리 1GB 대비) ───────────────────────
#
# PocketBase 자체는 수십 MB면 되지만, 이 서버는 메모리가 1GB이고 이미
# 절반쯤 쓰고 있다. 스왑이 없으면 한순간 몰릴 때 커널이 프로세스를
# 죽여버린다(OOM). 안전판으로 2GB를 만들어 둔다.

if ! swapon --show | grep -q .; then
  log "스왑 2GB 만드는 중"
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
else
  log "스왑이 이미 있습니다 — 건너뜁니다"
fi

# ─────────────────────────── 내려받기 ───────────────────────────

log "필요한 것 설치 (unzip, curl)"
apt-get update -qq
apt-get install -y -qq unzip curl

case "$(uname -m)" in
  x86_64) PB_ARCH="amd64" ;;
  aarch64) PB_ARCH="arm64" ;;
  *) echo "지원하지 않는 아키텍처: $(uname -m)" >&2; exit 1 ;;
esac

log "PocketBase ${PB_VERSION} (${PB_ARCH}) 내려받는 중"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
curl -fsSL -o "$TMP/pb.zip" \
  "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_${PB_ARCH}.zip"

mkdir -p "$PB_DIR"
unzip -o -q "$TMP/pb.zip" -d "$PB_DIR" pocketbase
chmod +x "$PB_DIR/pocketbase"

# ────────────────────────── 전용 계정 ──────────────────────────
#
# root로 돌리지 않는다. 웹에 열리는 프로세스라, 뚫렸을 때 이 서버 전체가
# 아니라 이 디렉터리까지만 내주게 한다.

if ! id "$PB_USER" &>/dev/null; then
  log "전용 계정 만드는 중: $PB_USER"
  useradd --system --home "$PB_DIR" --shell /usr/sbin/nologin "$PB_USER"
fi
mkdir -p "$PB_DIR/pb_data"
chown -R "$PB_USER:$PB_USER" "$PB_DIR"

# ────────────────────────── systemd ──────────────────────────

log "systemd 서비스 등록"
cat >/etc/systemd/system/pocketbase.service <<EOF
[Unit]
Description=PocketBase (System Diary Designer)
After=network.target

[Service]
Type=simple
User=${PB_USER}
Group=${PB_USER}
WorkingDirectory=${PB_DIR}
ExecStart=${PB_DIR}/pocketbase serve --http=${PB_BIND}
Restart=always
RestartSec=5

# 뚫렸을 때 번져나갈 자리를 좁힌다.
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${PB_DIR}

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now pocketbase
sleep 2

log "상태"
systemctl --no-pager --lines=5 status pocketbase || true

cat <<EOF

────────────────────────────────────────────────────────────
설치가 끝났습니다. PocketBase가 ${PB_BIND} 에서 돌고 있습니다.

다음에 할 일:
  1. nginx + 인증서 설정      → server/README.md 2단계
  2. 관리자 계정 만들기        → server/README.md 3단계
  3. projects 컬렉션 만들기    → server/README.md 4단계

바깥에서 바로 열리지 않게 127.0.0.1에만 묶어뒀습니다. nginx를 세우기
전에 먼저 확인하려면 로컬에서 ssh 터널을 뚫으세요:

  ssh -L 8090:127.0.0.1:8090 <사용자>@<서버IP>
  → http://127.0.0.1:8090/_/
────────────────────────────────────────────────────────────
EOF
