#!/usr/bin/env bash
# Zählt die entscheidenden Zeilen im WSL2-Protokoll — die Gegenprobe zur
# Windows-Messung. Ohne sie ist "0 Deaktivierungen" eine Behauptung.
L="${1:-/tmp/pmh-5311.log}"
echo "Protokoll: $L"
echo "Zeilen: $(wc -l < "$L")"
echo "Vorkommen 'incompatible': $(grep -c 'incompatible' "$L")"
echo "Vorkommen 'disabling':    $(grep -c 'disabling' "$L")"
echo "Vorkommen 'did not activate': $(grep -c 'did not activate' "$L")"
echo "--- alle pmh-Zeilen ---"
grep -E '^pmh' "$L" | head -10
echo "--- die zwei nicht aktivierten Einträge ---"
grep -A3 'did not activate' "$L" | head -12
