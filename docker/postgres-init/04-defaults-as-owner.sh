#!/bin/sh
# =============================================================================
# 04 — Die Vorgaben als Eigentuemerin setzen
# =============================================================================
#
# **Warum das ein Skript ist und kein SQL.** `ALTER DEFAULT PRIVILEGES` gilt fuer
# die Rolle, die es setzt. Die Anweisungen muessen also **als die Eigentuemerin**
# laufen — und das geht nur mit einer zweiten Verbindung. Der Eintragungspunkt
# von PostgreSQL fuehrt aber alles als Superuser aus.
#
# Das ist der eine Schritt, den man in vielen Einrichtungen vergeblich sucht:
# die Vorgaben stehen da, sehen richtig aus und greifen trotzdem nie — weil sie
# fuer die falsche Rolle gesetzt wurden. Hier laufen sie fuer die richtige.
#
# **Warum das Skript die Variablen selbst mitbringt.** Ein `psql -U ... -f ...`
# erbt die Umgebung des Eintragungspunkts nicht so, wie man denkt: `psql`
# uebernimmt `PGUSER`/`PGPASSWORD`, und die `:variablen` muessen ueber `-v`
# gereicht werden. Deshalb steht hier alles ausdruecklich.
#
# **Und warum das Skript nie den Start abbricht.** Ein Fehler in der
# Rechteeinrichtung ist ein Befund, aber er darf die Datenbank nicht
# unbenutzbar machen: die Tabellen kommen spaeter durch die Migrationen, und
# ohne diese Vorgaben funktioniert die Anwendung — nur die **kuenftigen** Rechte
# fehlen dann. Das wird laut gemeldet, nicht verschwiegen.

set -u

echo ""
echo "=== 04: Vorgaben (ALTER DEFAULT PRIVILEGES) als Eigentuemerin setzen ==="

: "${PMH_OWNER_USER:?PMH_OWNER_USER fehlt}"
: "${PMH_OWNER_PASSWORD:?PMH_OWNER_PASSWORD fehlt}"
: "${PMH_APP_USER:?PMH_APP_USER fehlt}"
: "${PMH_READONLY_USER:?PMH_READONLY_USER fehlt}"
: "${POSTGRES_DB:?POSTGRES_DB fehlt}"

# Auf den Server warten: der Eintragungspunkt laeuft waehrend der
# Initialisierung, und der temporaere Server braucht einen Moment.
i=0
until pg_isready -q -U "$PMH_OWNER_USER" -d "$POSTGRES_DB" 2>/dev/null; do
  i=$((i + 1))
  if [ "$i" -gt 30 ]; then
    echo "  WARNUNG: Server nicht bereit — Vorgaben NICHT gesetzt."
    echo "  Folge: kuenftige Tabellen haben keine Rechte fuer ${PMH_APP_USER}."
    echo "  Nachholen: psql -U ${PMH_OWNER_USER} -d ${POSTGRES_DB} -f docker/postgres-init/defaults-as-owner.sql.in"
    exit 0
  fi
  sleep 1
done

if PGPASSWORD="$PMH_OWNER_PASSWORD" psql -q -v ON_ERROR_STOP=1 \
     -U "$PMH_OWNER_USER" -d "$POSTGRES_DB" \
     -v owner_user="$PMH_OWNER_USER" \
     -v app_user="$PMH_APP_USER" \
     -v ro_user="$PMH_READONLY_USER" \
     -f /docker-entrypoint-initdb.d/defaults-as-owner.sql.in; then
  echo "  OK: Vorgaben gesetzt (fuer kuenftige Tabellen, Sequenzen und Funktionen)."
else
  echo "  WARNUNG: Vorgaben konnten NICHT gesetzt werden."
  echo "  Folge: kuenftige Tabellen haben keine Rechte fuer ${PMH_APP_USER}."
  echo "  Das ist ein Befund, kein Abbruch — die Anwendung laeuft, aber neue"
  echo "  Tabellen brauchen danach ein manuelles GRANT."
fi

echo "=== 04: fertig ==="
echo ""
