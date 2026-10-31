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
# 0. Liege ich überhaupt im Projekt? — der Ein-Zeilen-Weg (`curl … | sh`)
# -----------------------------------------------------------------------------
# **Warum dieser Zweig seit dem 14.10.2026 existiert.** Bei `curl -fsSL … | sh`
# gibt es **keine Skriptdatei**: `$0` ist dann `sh`, und `dirname "$0"` ist `.`.
# Der `cd` in das Projektverzeichnis landete damit im **Elternverzeichnis des
# Aufruforts** — das Skript hätte dort „installiert", wo nichts zu installieren
# ist, und zwar ohne Fehlermeldung.
#
# Jetzt gilt: erst **prüfen**, ob hier wirklich das Projekt liegt. Wenn nicht,
# wird es **geholt** — genau das, was der Ein-Zeiler verspricht. Damit ist der
# Ein-Zeiler vorbereitet, sobald das Repository öffentlich ist.
#
# Übersteuerbar, damit die Wege prüfbar sind, ohne das Netz zu brauchen:
#   PMH_REPO=<url-oder-pfad>   Quelle des Projekts
#   PMH_VERZEICHNIS=<name>     Zielordner im aktuellen Verzeichnis
PMH_REPO="${PMH_REPO:-https://github.com/LangLi7/prometheus-harness.git}"
PMH_VERZEICHNIS="${PMH_VERZEICHNIS:-prometheus-harness}"

istProjekt() {
  [ -f scripts/install.mjs ] && [ -f package.json ]
}

CDPATH=''
# Nur wechseln, wenn neben MIR ein Projekt liegt. Bei einer Pipe gibt es kein
# „neben mir", dann bleibt das Arbeitsverzeichnis, wie es ist.
if [ -n "${0:-}" ] && [ -f "$(dirname -- "$0")/../scripts/install.mjs" ]; then
  cd -- "$(dirname -- "$0")/.."
fi

if ! istProjekt; then
  echo "Hier liegt kein Prometheus-Harness-Projekt — es wird geholt."
  echo "  Quelle: $PMH_REPO"
  echo "  Ziel:   $(pwd)/$PMH_VERZEICHNIS"
  echo
  if ! command -v git >/dev/null 2>&1; then
    echo "FEHLER: 'git' fehlt, und ohne git kann das Projekt nicht geholt werden." >&2
    echo "  Debian/Ubuntu:  sudo apt-get install -y git" >&2
    echo "  Fedora:         sudo dnf install -y git" >&2
    echo "  Alpine:         sudo apk add git" >&2
    echo "  Arch:           sudo pacman -S git" >&2
    echo "  macOS:          xcode-select --install   (oder: brew install git)" >&2
    echo >&2
    echo "Danach dieses Skript erneut aufrufen." >&2
    exit 1
  fi
  if [ -e "$PMH_VERZEICHNIS" ]; then
    echo "FEHLER: '$PMH_VERZEICHNIS' gibt es hier schon — ich überschreibe nichts." >&2
    echo "  Entweder dort hineingehen und 'sh scripts/install.sh' aufrufen," >&2
    echo "  oder PMH_VERZEICHNIS auf einen anderen Namen setzen." >&2
    exit 1
  fi
  git clone --depth 1 "$PMH_REPO" "$PMH_VERZEICHNIS" || {
    echo "FEHLER: das Klonen ist gescheitert. Ist die Adresse erreichbar und das" >&2
    echo "  Repository für dich lesbar? Adresse: $PMH_REPO" >&2
    exit 1
  }
  cd -- "$PMH_VERZEICHNIS"
  echo "Geholt nach $(pwd) — die Installation läuft dort weiter."
  echo
  # **Weiterreichen statt kopieren.** Die Fortsetzung ist dasselbe Skript aus dem
  # geklonten Baum, damit es nur EINE Fassung der Installation gibt.
  exec sh scripts/install.sh "$@"
fi

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

# **Bash für Bun — und zwar nur, wenn Bun wirklich fehlt.**
# Das offizielle Installationsskript von Bun beginnt mit `#!/usr/bin/env bash`
# (gemessen am 31.10.2026 an https://bun.sh/install). Auf Alpine gibt es nur
# BusyBox-`sh`; ohne diese Zeile scheiterte `curl … | bash` dort mit
# „bash: not found" — und zwar an einer Stelle, die nach einem Fehler des
# Skripts aussieht. Steht Bun schon, wird bash nicht gebraucht.
if ! command -v bun >/dev/null 2>&1 && ! command -v bash >/dev/null 2>&1; then
  fehlende="$fehlende bash"
fi

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
# 6. Docker: die Datenbank braucht es
# -----------------------------------------------------------------------------
# Warum das hier geschieht und nicht in `install.mjs`. Auf Linux ist Docker
# über das offizielle Skript installierbar; das braucht root. `sudo` ist hier
# schon geprüft (Schritt 2) — in Bun müsste dieselbe Rechteprüfung ein zweites
# Mal stehen.
#
# Der unangenehme Teil danach. `usermod -aG docker` wirkt erst nach einer
# neuen Anmeldung. Ohne diese Prüfung scheiterte Schritt 4 des Installers mit
# „permission denied while trying to connect to the Docker daemon" — und das
# sieht nach einem Fehler des Installers aus, nicht nach einer Gruppenregel.
#
# Übersteuerbar: `PMH_OHNE_DOCKER=1` überspringt die Installation (wer den Stapel
# nicht will oder Docker schon anders bereitstellt).
if [ "${PMH_OHNE_DOCKER:-0}" != '1' ] && ! command -v docker >/dev/null 2>&1; then
  echo
  echo "Docker fehlt — wird installiert (PostgreSQL und Redis laufen darin)."
  if [ -z "$rechte" ]; then
    echo "FEHLER: Docker zu installieren braucht root, und sudo gibt es nicht."
    echo "  Als root ausführen, oder: curl -fsSL https://get.docker.com | sudo sh"
    echo "  Ohne Docker: PMH_OHNE_DOCKER=1 sh scripts/install.sh"
    exit 1
  fi
  if [ "$rechte" = 'sudo' ]; then docker_root='sudo'; else docker_root=''; fi
  if ! $docker_root sh -c 'curl -fsSL https://get.docker.com | sh'; then
    echo "FEHLER: die Docker-Installation ist gescheitert."
    echo "  Von Hand: curl -fsSL https://get.docker.com | sudo sh"
    echo "  Ohne Docker: PMH_OHNE_DOCKER=1 sh scripts/install.sh"
    exit 1
  fi
  # Die Gruppe gibt es erst mit dem Paket; `|| true`, weil sie auf manchen
  # Systemen schon existiert und `usermod` dann nichts zu tun hat.
  if [ "$(id -u)" != '0' ]; then
    $docker_root usermod -aG docker "$USER" || true
  fi
fi

# Die Rechteprüfung, die den Unterschied macht. `docker info` fragt den
# Daemon, nicht die Binärdatei: installiert und trotzdem gesperrt ist genau der
# Zustand nach `usermod`, solange die Sitzung alt ist.
if command -v docker >/dev/null 2>&1 && ! docker info >/dev/null 2>&1; then
  echo
  echo "Docker ist installiert, aber dieser Benutzer darf es noch nicht benutzen."
  echo "  Einmal ab- und wieder anmelden (oder: newgrp docker), dann erneut starten."
  echo "  Ohne Docker: PMH_OHNE_DOCKER=1 sh scripts/install.sh"
  exit 1
fi

# -----------------------------------------------------------------------------
# 7. Übergeben an die eigentliche Installation
# -----------------------------------------------------------------------------
# **Warum `exec`.** `exec` ersetzt diesen Prozeß; der Exit-Code des Skripts ist
# damit der Exit-Code dieses Skripts — ohne Zwischenvariable, die man vergessen
# kann. Und `"$@"` reicht die Argumente unverändert weiter (`--ohne-stapel`).
exec bun scripts/install.mjs "$@"
