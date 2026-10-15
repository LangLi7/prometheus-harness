# Die KI-Pakete — Bestand und Nachweise

Stand: 15.10.2026. **Alle Zahlen stammen aus einem Lauf**, nicht aus der Erinnerung:

```
bun test   in jedem Paketverzeichnis einzeln
```

| Paket | Prüfungen | Was es beweist |
|---|---|---|
| `ai/faehigkeiten` | **31** | Der Vertrag: sechs Fähigkeiten, die Registratur, die drei Stufen (`handeln`/`rueckfrage`/`mensch`), der Mensch als letzter Anbieter |
| `ai/openrouter` | **47** | Ein Anbieter, **vier** Fähigkeiten über **vier** Wege — über einen echten Socket, Mehrtelldaten eingeschlossen |
| `ai/waechter` | **20** | Die Kontrolle **vor** der Tat: neun Formregeln + eingetragene Werte; bei einem Fund **kein** Modellaufruf |
| `ai/verzeichnis` | **32** | Das Verzeichnis **als Daten**: sieben Anbieter, je Fähigkeit der Weg, mit drei Zuständen statt Ja/Nein |
| `ai/einstellungen` | **36** | Die Wahl des Endnutzers als Datei — ohne Schlüssel, ohne Vorgabemodell, mit Riegel gegen fremde Zuhause |
| `ai/verwalter` | **42** | Der Katalog, der Ausleger, der Lauf: Widerspruchsprüfung in **beide** Richtungen |
| `ai/aufbau` | **10** | Das Zusammenfügen: der Mensch **zuletzt**, unbekannter Anbieter **gemeldet** |
| `ai/lokal` | **20** | Gewichte holen, **prüfen**, ablegen — ohne Prüfsumme kein „heil" |
| `client/quellordner` | **47** | Der Ordnerdialog: Oberfläche, vier Wege, Keks + Arbeitsbereich, Bündel |
| **zusammen** | **285** | **0 rot** |

Dazu: **`bun run scripts/typecheck.mjs` → 37 Pakete grün, 0 rot.**

## Die lebenden Messungen (nicht nur Prüfungen)

| Was | Ergebnis | Beleg |
|---|---|---|
| Die **Kette** wirkt | Einstellungsdatei → Aufbau → Registratur → Modell → geprüftes Urteil | `kette-lauf.md` |
| **Sieben** Anbieter erkundet | OpenRouter 462, Nous 423, ZenMux 207, OpenCode 86, Anthropic 14, Z.ai 11, DeepSeek 2 | `anbieter-erkundung.md` |
| Der **Verwalter** läuft | 3 Läufe, zuletzt 2 von 7 Auslegungen angenommen, 5 abgelehnt | `verwalter-lauf.md` |
| Das **Auslegermodell** gemessen | nichtdenkend **20,3 s**, denkend **628 s** — 31× schneller | `verwalter-lauf.md` |
| Kosten | Schlüsselzähler **0,03224358 $** für alles zusammen | `GET /api/v1/key` |

## Was OFFEN ist — mit Grund

| Offen | Grund |
|---|---|
| Der Ordnerdialog ist **nicht eingetragen** | `scripts/client-buendel.mjs` und `scripts/profile-patch.mjs` sind **uncommitted von fremder Arbeit verändert**; der Weg steht in `quellordner-eintragung.md` §7 |
| **Sichtprüfung** des Dialogs | Auf diesem Rechner ist **kein Browser** (Chrome, Edge, Firefox fehlen) |
| Die **Laufzeit** eines lokalen Modells | `ai/lokal` prüft und verwahrt Gewichte; die Ausführung ist nicht gebaut |
| **Tevs** Adresse und Prüfsumme | **nicht ermittelt** — eine erfundene wäre schlimmer als eine fehlende |
| Der **Ausleger** trägt wenig bei | Er antwortet nur, wenn die Messung ihn deckt; sonst steht die Auslegung als *offen* im Katalog |
| `denkhilfe` (Denken auslagern) | Entworfen und gemessen, **nicht gebaut** — der Hebel `reasoning_effort` ist einfacher und noch nicht gesetzt |

## Die Bauweise in einem Satz

**Was eine Regel entscheiden kann, entscheidet die Regel. Was sie nicht kann, entscheidet ein
Modell — gedeckt von einer Messung. Und wo beides nicht reicht, entscheidet ein Mensch.**

Belege in `docs/status/`:

- `openrouter-schnittstelle.md` — die gemessenen Wege samt Fehlermeldungen
- `entscheiden-und-waechter.md` — Unsicherheit, Jev, und wer am Ende fragt
- `anbieter-kern.md` — was der Host kann (nur Chat) und was fehlt
- `anbieter-erkundung.md` — die bekannten Anbieter, erkundet statt geraten
- `verwalter-lauf.md` — drei lebende Läufe, mit den Fehlern
- `kette-lauf.md` — der Beweis, daß die Kette wirkt
- `denkhilfe.md` — zwei Probleme, die nicht dasselbe sind
- `quellordner-eintragung.md` — der Eintragungsweg und der Blocker
- `arbeitsweise.md` — **41 Regeln**, jede aus einem eigenen Fehler
