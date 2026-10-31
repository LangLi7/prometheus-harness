# API-Token je Konto — der fehlende Aufrufer für `user_secrets`

**Stand:** 18.10.2026 · **Gebaut:** `packages/api/auth-http/src/token.ts`, `apps/universe/src/token-panel.ts`, `befehl /token`

## 1. Warum das gebaut wurde

Der Betreiber: *„ich denke wir sollten ein Token implementierungs möglichkeit machen als `/` oder so.
passend zum prometheus … so viel ich weiss hat jeder user sein eigenes AI API tokens model und das
könnte wir für andere stuff aplyen yk?"*

Der Befund davor war derselbe wie bei C1: **`user_secrets` hatte keinen Aufrufer im Betrieb.** Die
Umschlagverschlüsselung stand, `scripts/geheimnis.mjs` konnte einen Schlüssel setzen — aber nur der
Bediener, nicht der Benutzer. Es gab **keinen** Weg, auf dem ein angemeldeter Mensch seinen
OpenRouter-, DeepSeek- oder Z.ai-Schlüssel einträgt.

Das ist jetzt der Weg. Er ist **je Konto**, nicht je Rechner: die `user_id` kommt aus der Sitzung und
steht in jeder Abfrage.

## 2. Die drei Wege

| Weg | Methode | Was er tut | CSRF |
|---|---|---|---|
| `/api/pmh/token` | `GET` | Anbieter und **nur** „gesetzt / nicht gesetzt" + `key_hint` | nein |
| `/api/pmh/token` | `POST` | einen Schlüssel setzen (Klartext im Rumpf) | **ja** |
| `/api/pmh/token` | `DELETE` | den Schlüssel dieses Kontos entfernen | **ja** |

**Ein Pfad, ein Eintrag.** Der Webserver schlüsselt seine Routen über `(kind, path)` und wirft bei
einem doppelten Eintrag. Drei Einträge für denselben Pfad sahen richtig aus und hätten den Host
**beim Start** beendet; jetzt verteilt ein Handler nach der Methode, und
`packages/api/auth-http/tests/token.test.ts` hält das fest.

## 3. Was **nie** zurückkommt

- **kein Klartext** — weder im `GET` noch in der Antwort auf `POST`.
- **kein Geheimtext** — `listeGeheimnisse` fragt `value_cipher` und `wrapped_key` gar nicht ab.
- **kein Schlüssel im Browser-Speicher** — kein `localStorage`, kein `sessionStorage`, kein Keks.
- **kein Schlüssel in der Adresse** — der Wert steht im `POST`-Rumpf; ein `GET`-Parameter landete in
  Verlauf, Proxy-Log und `Referer`.
- **kein Schlüssel im Verlauf** — der Befehl heißt `/token` und öffnet ein Panel; der Wert wird im
  Paßwortfeld eingegeben.

Was bleibt, ist der **Hinweis** (`key_hint`, acht Hexzeichen eines SHA-256). Er beantwortet „ist das
noch derselbe Schlüssel?" und ist kein Ersatz für den Schlüssel.

## 4. Die Anbieter und ihre `ref`

Dieselben Namen, die `scripts/geheimnis.mjs` benutzt — wer dort schon einen Schlüssel gesetzt hat,
findet ihn im Panel als „gesetzt" vor:

| Anbieter | `ref` |
|---|---|
| OpenRouter | `OPENROUTER_API_KEY` |
| DeepSeek | `DEEPSEEK_API_KEY` |
| Anthropic | `ANTHROPIC_API_KEY` |
| Z.ai | `ZAI_API_KEY` |
| ZenMux | `ZENMUX_API_KEY` |
| Nous Research | `NOUS_API_KEY` |
| OpenCode Zen | `OPENCODE_API_KEY` |

**Ein Schlüssel, viele Fähigkeiten.** OpenRouter bedient Chat, TTS, Transkription, Einbetten und Bild
über einen Schlüssel; deshalb steht der Schlüssel beim **Anbieter**, nicht bei der Fähigkeit
(`docs/status/faehigkeiten-und-anbieter.md`).

## 5. Der Hauptschlüssel

`token.ts` holt ihn über `holeHauptschluessel(standardQuellen(process.env, home), version)` — dieselbe
Leiter wie `scripts/geheimnis.mjs`: Datei `master.key` (0600) → Docker-Secret →
`PMH_MASTER_KEY`. In dieser Installation ist `PMH_MASTER_KEY` gesetzt (43 Zeichen, Fassung 1).

Fehlt er, antwortet der Weg **503 `kein-hauptschluessel`** mit dem nächsten Schritt
(`bun scripts/schluessel.mjs` und Host neu starten) — kein 500, kein stiller Fehlschlag.

## 6. Die Oberfläche

- **`/token`** im Terminal (ein führender `/` wird vor dem Nachschlagen entfernt; `/help` ist
  derselbe Befehl wie `help`).
- Das Panel **API-Token** in der Insel (Gruppe „Werkzeuge").
- Liste der Anbieter mit „gesetzt / nicht gesetzt" und Hinweis; ein Paßwortfeld; Speichern und
  Entfernen.
- Nach dem Speichern ist das Feld **leer**, die Liste zeigt „gesetzt" und den neuen Hinweis.
- Ohne Sitzung: der Satz „Nicht angemeldet" und ein Link auf `/anmeldung/`.

## 7. Prüfstand

| Prüfung | Ergebnis |
|---|---|
| `packages/api/auth-http/tests/token.test.ts` | **8 pass · 0 fail** |
| `apps/universe/tests` | **335 pass · 0 fail** |
| `tsgo --noEmit` (auth-http, universe) | **0 Fehler** |
| Browser (kopflos, 1440×900) | Panel über `/token` geöffnet; Speichern setzt „gesetzt" und den Hinweis; Feld danach leer |

## 8. Offen und benannt

| Was | Warum |
|---|---|
| **Host neu starten** | Die Routen werden beim Start registriert. Die Oberfläche ist gebaut; der laufende Host kennt `/api/pmh/token` erst nach einem Neustart. |
| **Verbraucher** | Gespeichert und lesbar ist der Schlüssel; der Modell-Router und die Rangliste lesen ihn **noch nicht**. Der nächste Schritt ist `ladeGeheimnis(sql, haupt, { userId, ref })` an der Stelle, an der ein Modellaufruf den Schlüssel braucht. |
| **Rotation im Panel** | Ein neuer Schlüssel überschreibt den alten (`ON CONFLICT`); ein Übergangsfenster mit zwei gültigen Schlüsseln ist nicht gebaut. |
| **Kontingent** | Kein Verbrauch, keine Obergrenze je Konto; `token-meter` und `usage-budget` existieren, sind aber nicht an diesen Weg gehängt. |
| **Test gegen Postgres** | Der Test prüft die Regeln und die Routenform; die Speicherkette ist in `docs/status/geheimnisse-ablage.md` mit einem echten Lauf belegt, nicht in dieser Datei. |
