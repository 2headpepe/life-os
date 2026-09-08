#!/usr/bin/env bash
# Double-clickable macOS launcher for Life OS.
# Run directly from the repo folder, or symlink to Desktop:
#   ln -sf "$(pwd)/life-os.command" ~/Desktop/life-os.command

set -euo pipefail

# Resolve symlinks so Desktop shortcuts work
SCRIPT="$0"
while [ -L "$SCRIPT" ]; do
    SCRIPT_DIR="$(cd -P "$(dirname "$SCRIPT")" && pwd)"
    SCRIPT="$(readlink "$SCRIPT")"
    [[ "$SCRIPT" != /* ]] && SCRIPT="$SCRIPT_DIR/$SCRIPT"
done
REPO_ROOT="$(cd -P "$(dirname "$SCRIPT")" && pwd)"
BACKEND="$REPO_ROOT/life-os/backend"
FRONTEND="$REPO_ROOT/life-os/frontend"
BACKEND_PORT=3001
FRONTEND_PORT=5173
APP_URL="http://localhost:${FRONTEND_PORT}"

bold="\033[1m"
green="\033[32m"
amber="\033[33m"
red="\033[31m"
muted="\033[90m"
reset="\033[0m"

echo ""
echo -e "${bold}Life OS${reset}  $(date '+%Y-%m-%d %H:%M')"
echo -e "${muted}────────────────────────────────${reset}"

# ── Check .env ──
if [ ! -f "$BACKEND/.env" ]; then
    echo -e "${red}Нет файла $BACKEND/.env${reset}"
    echo -e "Скопируй: ${muted}cp life-os/backend/.env.example life-os/backend/.env${reset}"
    echo -e "И заполни API ключ."
    read -r -p "Нажми Enter для выхода..." && exit 1
fi

# ── Check node_modules ──
if [ ! -d "$BACKEND/node_modules" ]; then
    echo -e "${amber}Устанавливаю зависимости бэкенда...${reset}"
    (cd "$BACKEND" && npm install --silent)
fi
if [ ! -d "$FRONTEND/node_modules" ]; then
    echo -e "${amber}Устанавливаю зависимости фронтенда...${reset}"
    (cd "$FRONTEND" && npm install --silent)
fi

# ── Kill old processes on ports ──
for PORT in $BACKEND_PORT $FRONTEND_PORT; do
    OLD=$(lsof -ti :"$PORT" 2>/dev/null || true)
    if [ -n "$OLD" ]; then
        echo -e "${muted}Освобождаю порт $PORT (pid $OLD)...${reset}"
        kill -9 $OLD 2>/dev/null || true
        sleep 0.3
    fi
done

# ── Start backend ──
echo -e "${amber}Запускаю бэкенд...${reset}"
(cd "$BACKEND" && node --env-file=.env server.js) &
BACKEND_PID=$!

# Wait for backend to respond
for i in {1..20}; do
    if curl -s -o /dev/null "http://localhost:${BACKEND_PORT}/api/config" 2>/dev/null; then
        break
    fi
    sleep 0.5
done

if ! curl -s -o /dev/null "http://localhost:${BACKEND_PORT}/api/config" 2>/dev/null; then
    echo -e "${red}Бэкенд не ответил. Проверь .env и логи выше.${reset}"
    kill $BACKEND_PID 2>/dev/null || true
    read -r -p "Нажми Enter для выхода..." && exit 1
fi
echo -e "${green}Бэкенд запущен${reset} (pid $BACKEND_PID)"

# ── Start frontend ──
echo -e "${amber}Запускаю фронтенд...${reset}"
(cd "$FRONTEND" && npm run dev -- --port $FRONTEND_PORT) &
FRONTEND_PID=$!
sleep 3

# ── Open browser ──
echo -e "${green}Открываю браузер...${reset}"
open "$APP_URL" 2>/dev/null || true

echo ""
echo -e "${bold}Life OS запущен${reset} → ${APP_URL}"
echo -e "${muted}Ctrl+C — остановить${reset}"
echo -e "${muted}────────────────────────────────${reset}"

# ── Cleanup on exit ──
cleanup() {
    echo ""
    echo -e "${muted}Останавливаю...${reset}"
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
    exit 0
}
trap cleanup INT TERM

wait $BACKEND_PID 2>/dev/null || true
