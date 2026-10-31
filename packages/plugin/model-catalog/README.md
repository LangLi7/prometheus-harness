# @prometheus-harness/model-catalog

Der Modellkatalog der Anbieter, **lebend** statt eingecheckt: das Plugin holt `GET /models` je
Routing-Anbieter, hält die Antwort eine Weile und schreibt die Vereinigungsmenge in die
`llm-pi-ai`-Routen. Damit ist ein neu erschienenes Modell in der Modellauswahl wählbar, ohne daß
jemand ein npm-Paket aktualisiert.

## Warum es das gibt

Der Betreiber am 26.10.2026, mit einem Bildschirmfoto der Modellsuche: *„wo ist
`recursive/flint-v1.0:free`?"* — das Modell stand bei OpenRouter, aber nicht in der Suche des
Composers. Die Ursache war nicht die Suche: `llm-pi-ai` führt je Route die Modelle aus
`providers.<id>.models` und, wenn dort nichts steht, die Modelle aus seinem npm-Paket. Dieses Paket
ist eine Momentaufnahme — Flint fehlte darin fünf Tage nach seinem Erscheinen.

Zwei Dinge folgen daraus:

1. Die Auswahl kann nur anbieten, was die Route führt. Ein Modell, das im Paket fehlt, ist **nicht
   wählbar** — nicht bloß nicht auffindbar.
2. Die Suche der Auswahl trifft **Namen**, nicht Kennungen (`rankByName` prüft `name`/`label`). Ein
   Slug wie `recursive/flint-v1.0:free` ist deshalb nie ein Suchtreffer; gesucht wird „Flint".

## Was es tut

| Schritt | Was passiert |
|---|---|
| Schlüssel | je Anbieter die Referenz `<PROVIDER>_API_KEY` lesen (Credential-Speicher, dann Umgebung) |
| Abruf | `baseUrl + /models` mit dem Kopf der Familie, 8 s Frist |
| Lesen | nur Modelle mit Textausgabe, ohne `openrouter/auto`-Weiterleitungen, ohne Doppelte |
| Zusammenlegen | was die Route schon führt, behält seinen Namen; der Anbieter liefert die Kapazitäten; Neues wird angehängt |
| Schreiben | `llm-pi-ai.providers.<id>.models`; unverändert heißt: kein Schreibvorgang |

Anbieter ohne hinterlegten Schlüssel werden **übersprungen und benannt** — nicht mit leeren Listen
angelegt. Die Vorgabe sind `openrouter`, `zenmux`, `nous`, `opencode`, `zai` und `anthropic`;
`deepseek` steht als Regel bereit, ist aber nicht in der Vorgabe, weil `deepseek-official` schon von
`llm-deepseek` bedient wird und eine zweite Route dieselben Modelle ein zweites Mal zeigte.

## Einstellungen

| Feld | Vorgabe | Bedeutung |
|---|---|---|
| `providers` | die sechs oben | welche Regeln gepflegt werden |
| `ttlMinutes` | `10` | wie lange ein geholter Katalog gilt, bevor der Takt neu holt |
| `create` | `key-only` | `never` = nur bestehende Routen füllen; `always` = auch ohne Schlüssel (dann steht die Gruppe ohne Key da) |
| `write` | `true` | `false` = nur berichten, nichts in die Einstellungen schreiben |

## Routen

| Weg | Zweck |
|---|---|
| `GET /api/pmh/model-catalog/status` | je Anbieter: `models`, davon `added`, `written`, `fetchedAt`, `error` |
| `POST /api/pmh/model-catalog/refresh` | erzwingt einen Lauf und antwortet mit dem Bericht |

Beide sind über `abweisung` gesperrt (dieselbe Naht wie im Usage-Plugin): die Statusroute nennt,
welche Schlüssel hinterlegt sind, die Aktualisierungsroute schreibt Einstellungen.

## Inbetriebnahme

Der Eintrag steht in der Patch-Schicht des Profils (`scripts/profile-patch.mjs` → `EIGENE_PAKETE`)
und wird bei jedem Start von `scripts/start.mjs` dorthin geschrieben. **Der laufende Host liest
diese Schicht nur beim Start** — nach dem ersten Eintragen ist deshalb ein Neustart nötig; ohne ihn
antwortet der Zaun des Hosts (`401 unauthorized`) statt des Plugins.

Nach dem Start, in dieser Reihenfolge:

1. `GET /api/pmh/model-catalog/status` — je Anbieter `models`, `added`, `written`, `error`. Ein
   `error` wie `no credential configured (ZENMUX_API_KEY)` ist die erwartete Antwort für Anbieter
   ohne Schlüssel, kein Defekt.
2. `POST /api/pmh/model-catalog/refresh`, falls der erste Lauf noch nicht durch ist.
3. Im Composer nach dem **Anzeigenamen** suchen (`Flint`), nicht nach der Kennung — die Suche der
   Auswahl trifft `name`, nicht `id`.

## Was es nicht tut

- **Keine Kapazitäten erfinden.** Was der Katalog nicht nennt, bleibt offen und fällt auf die
  Vorgabe des Adapters zurück (`defaultContextWindow`, `defaultMaxTokens`).
- **Keine Ausgabegrenze über der Vorgabe des Adapters.** Der Katalog nennt die *maximale* Ausgabe —
  Flint 235 929 Token bei 262 144 Kontext. Eingetragen wäre das ein Abzug vom Prompt-Budget: es
  blieben 26 215 Token für den Auftrag. Geschrieben wird eine Ausgabe deshalb nur, wenn sie
  **kleiner** ist als `ADAPTER_DEFAULT_MAX_TOKENS` (32 768); alles darüber übernimmt der Adapter
  ohnehin.
- **Keine Routen umbauen.** Geschrieben wird nur `models`; `apiKeyEnv`, `api` und `baseURL` kommen
  beim Anlegen dazu und werden bei bestehenden Routen nicht angetastet.
- **Kein Lazy-Save beim Auswählen.** Die Auswahl des Composers kann nur bieten, was die Route
  führt; deshalb wird die Liste gefüllt und nicht die Auswahl abgefangen.

## Risiken, die bleiben

- Die geschriebene Liste **ersetzt** den Paketkatalog der Route (Semantik von `llm-pi-ai`:
  `entries = configured.length > 0 ? configured : [...defaults]`). Sie wird bei jedem Lauf aus dem
  Anbieter neu gebildet; wer die Zeile löscht, bekommt den Paketkatalog zurück.
- Ein Anbieter, der `/models` ohne Authentifizierung beantwortet, liefert auch ohne Schlüssel nichts
  — der Lauf überspringt ihn dann mit Begründung.
- ZenMux ist im Katalog von pi-ai nicht beschrieben: Protokoll und Basis kommen aus dem Verzeichnis,
  und ob der Chat-Weg mit einem Schlüssel trägt, ist dort **ungemessen** (jeder POST gab 403).
