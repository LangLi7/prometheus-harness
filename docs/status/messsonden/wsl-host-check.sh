#!/usr/bin/env bash
# Prüft den Host unter WSL2 inklusive Token-Weiterleitung — die Messung, die den
# Unterschied zwischen "404 auf /" und "Oberfläche wird ausgeliefert" zeigt.
set -u
export PATH="$HOME/.bun/bin:$PATH"
PORT="${1:-5311}"
cd /mnt/c/Users/Chang/prometheus-harness || exit 2

pkill -f 'apps/cli/src/main.ts' 2>/dev/null
sleep 1
rm -f /tmp/pmh-$PORT.log /tmp/pmh-$PORT.cookies

echo "bun: $(bun --version 2>&1 | head -1)"
timeout 90 bun apps/cli/src/main.ts web --port "$PORT" > /tmp/pmh-$PORT.log 2>&1 &
HOST_PID=$!

TOKEN=""
for i in $(seq 1 60); do
  sleep 1
  TOKEN=$(grep -oE 'token=[A-Za-z0-9_-]+' /tmp/pmh-$PORT.log 2>/dev/null | head -1 | cut -d= -f2)
  if [ -n "$TOKEN" ]; then
    echo "Token nach ${i}s gelesen (${#TOKEN} Zeichen)"
    break
  fi
done

if [ -z "$TOKEN" ]; then
  echo "KEIN Token im Protokoll — Host kam nicht hoch"
  tail -5 /tmp/pmh-$PORT.log
  kill "$HOST_PID" 2>/dev/null
  exit 1
fi

echo "=== 1. GET / ohne Token ==="
curl -s -o /dev/null -w 'status=%{http_code}\n' "http://127.0.0.1:$PORT/"

echo "=== 2. GET /?token=<token> (ohne Folgen) ==="
curl -s -o /dev/null -D /tmp/pmh-$PORT.h1 -w 'status=%{http_code}\n' "http://127.0.0.1:$PORT/?token=$TOKEN"
grep -iE '^(HTTP/|location|set-cookie)' /tmp/pmh-$PORT.h1 | head -6

echo "=== 3. GET / mit Cookie (der eigentliche Nachweis) ==="
curl -s -c /tmp/pmh-$PORT.cookies -o /dev/null "http://127.0.0.1:$PORT/?token=$TOKEN"
curl -s -b /tmp/pmh-$PORT.cookies -o /tmp/pmh-$PORT.html -w 'status=%{http_code} bytes=%{size_download} typ=%{content_type}\n' "http://127.0.0.1:$PORT/"
echo "erste 120 Zeichen:"
head -c 120 /tmp/pmh-$PORT.html 2>/dev/null
echo ""

echo "=== 4. Ist es die Oberfläche? ==="
grep -ioE '<title>[^<]*</title>|<!doctype html>' /tmp/pmh-$PORT.html 2>/dev/null | head -3
grep -c 'script' /tmp/pmh-$PORT.html 2>/dev/null | sed 's/^/script-Vorkommen: /'

kill "$HOST_PID" 2>/dev/null
sleep 1
pkill -f 'apps/cli/src/main.ts' 2>/dev/null
echo "=== Warnungen des Laufs (ohne Stapelspuren) ==="
grep -E '^(pmh|dsh web|web-app|webserver)' /tmp/pmh-$PORT.log | head -12
