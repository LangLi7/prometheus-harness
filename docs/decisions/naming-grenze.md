# Namensgrenze: was uns gehört und was dem Kern

**Anlaß:** 13.10.2026. Der Betreiber: *„rename noch den Prometheus, daß es im Basis-Naming kein
DeepSeek hat bzw. in Verbindung — es gibt ein paar Sachen, deren Name DeepSeek ist. Damit
meinte ich, daß es keine Namensverwirrung gibt."*

**Ergebnis:** die Namen, die **unsere** Wahl sind, wurden umbenannt. Die Stellen, an denen
„DeepSeek" **eine Tatsache** ist, bleiben — und dieses Blatt sagt, welche das sind und warum.

---

## 1. Umbenannt (unsere Namenswahl)

| vorher | nachher | wo |
|---|---|---|
| `packages/llm/llm-deepseek` | **`packages/llm/llm-http`** | Verzeichnis + Paketname |
| `@prometheus-harness/llm-deepseek` | **`@prometheus-harness/llm-http`** | Importe in 6 Dateien, Junction |
| `DeepSeekProvider` | **`LlmHttpProvider`** | Klasse. **Nicht `LlmProvider`** — der Name ist die Schnittstelle des Seams, das wäre eine Kollision |
| `DeepSeekOptions` | **`LlmHttpOptions`** | Schnittstelle |
| `readonly name = 'deepseek'` | **`'llm-http'`** | erscheint in Diagnosen und Berichten |
| `'deepseek+retry'`, `'deepseek-mit-wiederholung'` | **`'llm-http+retry'`**, **`'llm-http-mit-wiederholung'`** | Anbietername in der Wiederholung |
| `DeepSeek lehnt die Zugangsdaten ab` (und 5 weitere) | **`Der Anbieter lehnt …`** | Fehlertexte an den Benutzer |
| `const deepseek = …` | **`const anbieter = …`** | lokale Bezeichner in Prüfungen (13 Stellen) |
| `tests/deepseek.test.ts` | **`tests/llm-http.test.ts`** | Dateiname |
| README (en/de), MAPPING, `.env.example`, Zuordnungsdokumente | neutrale Fassung | Beschreibungen, Paketlisten, Beispieltexte |
| **`PMH_LLM_API_KEY`** | **neu** | eigene Umgebungsvariable. Sie **gewinnt**; die Variable des Anbieters bleibt als **Rückfall** |

**63 Ersetzungen in 13 Dateien**, dazu zwei Verzeichnis-/Dateiumbenennungen.

---

## 2. Nicht umbenannt — mit Grund und Beleg

| Was | Warum nicht | Beleg |
|---|---|---|
| `@deepseek-ai/cordis`, `@deepseek-ai/dsh-host-webserver`, … (**59 Treffer**) | das sind die **echten Paketnamen** der Abhängigkeit. Umbenennen heißt: der Import findet nichts, die Harness startet nicht | `node_modules/@deepseek-ai/` — die Ordner heißen so |
| `https://api.deepseek.com/v1` (**3**) | die **Adresse des Dienstes**. Ein anderer Name wäre eine andere Adresse | der Anbieter antwortet nur dort |
| `'deepseek-chat'`, `'deepseek-reasoner'`, `'deepseek-v4-flash'` (**30**) | **Modellkennungen im Anfragetext.** Der Anbieter lehnt ein unbekanntes Modell ab — die Harness gäbe keine Antwort mehr | `KNOWN_MODELS` in `llm-http/src/index.ts`; der Kern meldet selbst `"model":"deepseek-flash"` |
| `DEEPSEEK_API_KEY` (**5**) | steht in `.credentials.yaml` und in der Umgebung dieses Rechners. Abschaffen hieße: die Installation verliert ihren Schlüssel. Wird **weiter gelesen**, nur nicht mehr als einzige | `ANBIETER_API_KEY_ENV` in `llm-http/src/index.ts` |
| `DSH_HOME`, `~/.dsh`, Cookie `dsh-auth-…`, `DSH_WEB_URL` | **setzt der Kern bzw. die Umgebung.** Wir lesen sie; umbenennen können wir sie nicht | `resolvePmhHome` (Kette) und der Kern |
| `LICENSE` — *„Copyright (c) 2026 DeepSeek"*, *„nutzt den DeepSeek Harness als Codebasis"* | **Rechtspflicht.** Der Prometheus Harness ist ein abgeleitetes Werk eines MIT-lizenzierten Projekts; die Nennung des Urhebers ist Bedingung der Lizenz, nicht Kosmetik | `LICENSE` Zeilen 3, 27–31 |
| `MAPPING.md`, linke Spalte (`llm/llm-deepseek`, `session-log-deepseek`, …) | die **Modulnamen des Upstreams**. Eine Zuordnungstabelle, die ihre eigene linke Seite umbenennt, ist keine Zuordnung mehr | `MAPPING.md` |
| `docs/reference/verify/core-template-*.txt` | **Inventar des Kern-Dateibaums** — eine Momentaufnahme der Dateiliste des Referenz-Harness | die Zeilen enden auf Dateigröße und Zeitstempel |
| `docs/status/git-audit.md`, `kleinste-kette-nachweis.md`, `arbeitspakete.md` | **historische Meßprotokolle.** Sie beschreiben einen vergangenen Stand; ihn nachträglich umzuschreiben hieße, Messungen zu fälschen | die Einträge tragen Datum und Zahl |

---

## 3. Was der Betreiber wissen sollte

Die Umbenennung war **vollständig für unsere Namen und wirkungslos für die Tatsachen** — und
das ist keine Auslassung, sondern die Grenze: `api.deepseek.com` und `deepseek-chat` sind
**Daten**, `DSH_HOME` und `@deepseek-ai/*` gehören **anderen**.

**Unser Anbieter-Adapter steht außerdem nicht im Modellweg des Hosts.** Der Host antwortet
über den Anbieter **des Kerns** — im Nachweis steht `"provider":"deepseek-official"`, und das
ist der Name des Kerns, nicht unserer (`docs/status/api-nachweis.md`). `llm-http` wird heute
nur von der Integrationsprüfung der kleinsten Kette benutzt. Wer den eigenen Adapter im Host
haben will, muß ihn dort einhängen — das ist ein eigener Schritt.

---

## 4. Prüfstand nach der Umbenennung

| Prüfung | Ergebnis |
|---|---|
| Typsystem | **22 Pakete grün**, Exit **0** |
| Gesamtsuite | **1042 pass / 2 fail** — 1044 in 39 Dateien, **identisch zu vorher** |
| README-Paarung (en ↔ de) | **gekoppelt**, Exit **0** |
| LLM-Pakete einzeln | **131 pass / 0 fail** |
| Auflösung des neuen Namens | `@prometheus-harness/llm-http` **ok**; der **alte** Name löst **nicht mehr** auf |
| Kernnamen unberührt | **59** `@deepseek-ai/`, **3** `api.deepseek.com`, **5** `DEEPSEEK_API_KEY`, **30** Modellkennungen |

Die 2 roten sind **nicht unsere** und waren es vorher: `apps/cli` (`typert-loader`) und
`packages/util/atomic-write` (`Zugriff verweigert`, os error 5).
