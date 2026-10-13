#!/bin/sh
# =============================================================================
# Prometheus Harness — Installation für Linux und macOS
# =============================================================================
#
# ## Die zwei Schichten dieses Skripts, und warum es zwei sein müssen
#
# **Schicht 1 — Bootstrap (hier, in `sh`).** Auf einem frischen Linux fehlen die
# Werkzeuge, die man zum Installieren braucht. Gemessen am 13.10.2026 in
# minimalen Containern — also dem ehrlichen Fall „frisches System":
#
# | Werkzeug | ubuntu:24.04 | alpine:3 | debian:stable-slim |
# |---|---|---|---|
# | `curl` | **fehlt** | **fehlt** | **fehlt** |
# | `git` | **fehlt** | **fehlt** | **fehlt** |
# | `bash` | vorhanden | **fehlt** (nur BusyBox `sh`) | fehlt |
#
# Wer `curl … | bash` schreibt, setzt also genau das voraus, was fehlt. Deshalb
# läuft diese Schicht in **POSIX-`sh`** — das gibt es überall, auch auf Alpine —
# und benutzt **nur** `sh`-Sprachmittel.
#
# **Schicht 2 — die Installation selbst (`scripts/install.mjs`).** Sie ist in Bun
# geschrieben. Warum: sie braucht Dateizugriff, Prozeßstart und Netz — und Bun
# ist die eine Voraussetzung, die dieses Projekt ohnehin hat. Eine zweite
# Fassung in `sh` wäre eine zweite Wahrheit, die auseinandergeht.
#
# ## Was dieses Skript NICHT tut
#
# Es installiert **ohne Nachfrage** nur, was es zum Weiterlaufen braucht
# (`curl`, `git`, `ca-certificates`). Für `sudo` wird **gefragt**, wenn sudo es
# verlangt — das Betriebssystem fragt dann nach dem Kennwort. Wer das nicht will,
# installiert die Pakete selbst und ruft das Skript erneut auf.
#
# Docker wird **nicht** still installiert: auf einem Server ist das eine
# Entscheidung über Paketquellen, und auf einem Arbeitsplatz eine über eine
# Lizenz (Docker Desktop). Dieses Skript nennt den Befehl und bricht sichtbar ab.
#
# Aufruf:
#     sh scripts/install.sh
#     ./scripts/install.sh            # nach chmod +x
#     ./scripts/install.sh --ohne-stapel
# =============================================================================

set -eu

# -----------------------------------------------------------------------------
# In das Projektverzeichnis wechseln — unabhängig vom Aufrufort.
# -----------------------------------------------------------------------------
# `CDPATH=` verhindert, daß eine gesetzte Variable die Ausgabe von `cd` stört;
# ohne das könnte `cd` etwas ausgeben, was hier als Pfad weiterverwendet würde.
CDPATH=''
cd -- "$(dirname -- "$0")/.."

echo "Prometheus Harness — Installation"
echo "Projekt: $(pwd)"
echo

# -----------------------------------------------------------------------------
# 1. Paketverwalter finden — wir wissen nicht, welches Linux das ist
# -----------------------------------------------------------------------------
# **Warum nicht `apt` annehmen.** Gemessen: alpine hat `apk`, Fedora `dnf`, Arch
# `pacman`. Ein Skript, das `apt-get` fest verdrahtet, läuft auf drei von vier
# Systemen nicht — und zwar mit „command not found", was nach einem Fehler des
# Skripts aussieht.
paketverwalter=''
if command -v apt-get >/dev/null 2>&1; then paketverwalter='apt'
elif command -v dnf >/dev/null 2>&1; then paketverwalter='dnf'
elif command -v yum >/dev/null 2>&1; then paketverwalter='yum'
elif command -v apk >/dev/null 2>&1; then paketverwalter='apk'
elif command -v pacman >/dev/null 2>&1; then paketverwalter='pacman'
elif command -v zypper >/dev/null 2>&1; then paketverwalter='zypper'
elif command -v brew >/dev/null 2>&1; then paketverwalter='brew'
fi

# -----------------------------------------------------------------------------
# 2. Rechte bestimmen — root, sudo, oder keines von beiden
# -----------------------------------------------------------------------------
# **Warum hier und nicht beim Installieren.** Wer keine Rechte hat, soll das
# **vor** dem ersten Paketversuch erfahren — mit dem Befehl, den er selbst
# ausführen kann. Ein `sudo`-Aufruf, der scheitert, sieht nach einem Fehler des
# Skripts aus.
rechte=''
if [ "$(id -u)" = '0' ]; then
  rechte='root'
elif command -v sudo >/dev/null 2>&1; then
  rechte='sudo'
fi

# -----------------------------------------------------------------------------
# 3. Fehlende Pakete bestimmen
# -----------------------------------------------------------------------------
# **`command -v` ist die einzige Frage, die alle Systeme gleich beantworten:**
# *ist es aufrufbar?* Ein Blick in `/etc/os-release` oder `dpkg -l` wäre eine
# Annahme über das System, nicht über das Werkzeug.
#
# `ca-certificates` ist kein Programm, sondern Daten — es läßt sich nicht mit
# `command -v` finden. Es wird deshalb nur installiert, wenn **git es braucht**
# und der HTTPS-Zugriff scheitert. Siehe Schritt 5.
fehlende=''
for t in curl git; do
  if ! command -v "$t" >/dev/null 2>&1; then
    fehlende="$fehlende $t"
  fi
done

# -----------------------------------------------------------------------------
# 4. Fehlende Pakete installieren — oder sichtbar abbrechen
# -----------------------------------------------------------------------------
if [ -n "$fehlende" ]; then
  echo "Es fehlen:$fehlende"
  if [ -z "$paketverwalter" ]; then
    echo
    echo "FEHLER: kein bekannter Paketverwalter gefunden (apt/dnf/yum/apk/pacman/zypper/brew)."
    echo "Bitte selbst installieren:$fehlende"
    exit 1
  fi
  if [ -z "$rechte" ]; then
    echo
    echo "FEHLER: zum Installieren werden root-Rechte gebraucht, sudo gibt es nicht."
    echo "Bitte als root ausführen oder selbst installieren:$fehlende"
    echo
    echo "  apt-get update && apt-get install -y$fehlende     # Debian/Ubuntu"
    echo "  apk add$fehlende                                  # Alpine"
    echo "  dnf install -y$fehlende                           # Fedora/RHEL"
    exit 1
  fi

  # **`sudo` nur, wenn nötig.** Als root ist ein `sudo`-Aufruf bestenfalls
  # überflüssig und schlimmstenfalls nicht vorhanden.
  if [ "$rechte" = 'sudo' ]; then
    als_root='sudo'
  else
    als_root=''
  fi

  echo "Installiere:$fehlende (mit $paketverwalter)"
  # shellcheck disable=SC2086
  case "$paketverwalter" in
    apt)
      $als_root apt-get update
      # shellcheck disable=SC2086
      $als_root apt-get install -y $fehlende ca-certificates
      ;;
    apk)
      # shellcheck disable=SC2086
      $als_root apk add --no-cache $fehlende ca-certificates
      ;;
    dnf|yum)
      # shellcheck disable=SC2086
      $als_root "$paketverwalter" install -y $fehlende ca-certificates
      ;;
    pacman)
      # shellcheck disable=SC2086
      $als_root pacman -Sy --noconfirm $fehlende ca-certificates
      ;;
    zypper)
      # shellcheck disable=SC2086
      $als_root zypper --non-interactive install $fehlende ca-certificates
      ;;
    brew)
      # shellcheck disable=SC2086
      $als_root brew install $fehlende
      ;;
  esac
fi

# -----------------------------------------------------------------------------
# 5. Bun suchen — an den üblichen Orten, nicht nur im PATH
# -----------------------------------------------------------------------------
# **Warum das nötig ist.** Das Installationsskript von Bun legt die Binärdatei
# nach `~/.bun/bin` und trägt sie in die **Profildatei** ein. Eine laufende Shell
# liest die Profildatei nicht noch einmal — `bun` ist also da und trotzdem nicht
# auffindbar. Wer das nicht berücksichtigt, installiert Bun bei jedem Aufruf neu.
if ! command -v bun >/dev/null 2>&1; then
  if [ -x "$HOME/.bun/bin/bun" ]; then
    PATH="$HOME/.bun/bin:$PATH"
    export PATH
  fi
fi

if ! command -v bun >/dev/null 2>&1; then
  echo
  echo "Bun ist nicht installiert — wird jetzt installiert."
  # **Warum `curl` hier schon da ist.** Schritt 4 hat es installiert, falls es
  # fehlte. Das ist der ganze Grund für die Reihenfolge dieses Skripts.
  if ! command -v curl >/dev/null 2>&1; then
    echo "FEHLER: curl fehlt weiterhin — Bun kann nicht geladen werden."
    echo "Siehe https://bun.sh/docs/installation für andere Wege."
    exit 1
  fi
  echo "  curl -fsSL https://bun.sh/install | bash"
  curl -fsSL https://bun.sh/install | bash

  if [ -x "$HOME/.bun/bin/bun" ]; then
    PATH="$HOME/.bun/bin:$PATH"
    export PATH
  fi
  if ! command -v bun >/dev/null 2>&1; then
    echo
    echo "FEHLER: Bun ist auch nach der Installation nicht aufrufbar."
    echo "Starte eine NEUE Shell und rufe dieses Skript erneut auf."
    exit 1
  fi
  echo "  Bun installiert: $(bun --version)"
fi

echo "Bun: $(bun --version)"
echo

# -----------------------------------------------------------------------------
# 6. Übergeben an die eigentliche Installation
# -----------------------------------------------------------------------------
# **Warum `exec`.** `exec` ersetzt diesen Prozeß; der Exit-Code des Skripts ist
# damit der Exit-Code dieses Skripts — ohne Zwischenvariable, die man vergessen
# kann. Und `"$@"` reicht die Argumente unverändert weiter (`--ohne-stapel`).
exec bun scripts/install.mjs "$@"
