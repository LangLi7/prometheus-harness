# Zugänge: Stand, Lücken, Reihenfolge

Stand: 21.10.2026. Gemessen am Paket `packages/plugin/zugaenge` (75 Tests, Typecheck beider
Hälften, Bündel 45.311 B). Was hier als „fehlt" steht, ist **nicht** vergessen — es ist bewußt
nicht gebaut, und der Grund steht daneben.

## 1. Was steht

| Teil | Zustand |
|---|---|
| Einträge (Anbieter, Fähigkeiten, Modelle, Basis, Notiz) | Datei `$PMH_HOME/zugaenge.json`, streng geprüft |
| Schlüssel | Credential-Record `pmh-zugaenge/<id>` — mit `credentials-postgres` verschlüsselt in Postgres |
| Vier Routen (Liste, Speichern, Entfernen, Prüfen) | gesperrt (401/503) und CSRF-geschützt |
| Panel | Seitenleiste + Hauptfeld, anlegen/ändern/prüfen, ohne Schlüsselanzeige |
| Sonde | leere Aufträge, Statusdeutung, kostenlos; trennt „vorhanden / fehlt / unbekannt" |
| Dienst `ctx.zugaenge` | `zugang`, `familie`, `schluessel`, `anbieter` |
| Anbieteraufbau | `openrouter` (die eine gemessene Umsetzung); sonst `undefined` |
| Cordis-Naht | laden → abhängen → **wieder** laden; zwei Instanzen geteilt |

## 2. Was fehlt

### A. Der Anschluß — die eigentliche Lücke

| # | Was fehlt | Folge | Aufwand |
|---|---|---|---|
| A1 | `ai-capabilities` liest weiter `OPENROUTER_API_KEY` (eine **Referenz**), nicht die Records des Verwalters | Ein im Panel eingetragener Schlüssel wirkt **nicht** in `ai_decide`, `image_generate`, `speech_*`, `text_embed` | mittel — `kette.ts` + `flaechen.ts` + Tests |
| A2 | `einstellungen.wahl.anbieter` nennt die **Familie** (`openrouter`), `Anbieter.id` wäre die **Eintrags**-Kennung | `baueAuf` trägt den Eintrag nicht ein — die Wahl zeigt ins Leere, mit Hinweis, aber ohne Wirkung | klein, **nach** der Entscheidung in §3 |
| A3 | Kein generischer OpenAI-kompatibler Adapter | Ollama, llama.cpp, TEI, FreeLLMAPI sind **eintragbar und prüfbar**, aber nicht aufrufbar | mittel — und nur nach einer **Messung** der Form, nicht geraten |
| A4 | `gespraech` steht im Eintrag, hat aber keinen Verbraucher (Chat läuft über `@prometheus-harness/llm`) | Das Panel zeigt „bereit" für eine Fähigkeit, die der Verwalter nicht bedient | klein — Hinweis im Formular **oder** Feld aus dem Angebot nehmen |
| A5 | `anbieter()` nur für `openrouter` | DeepSeek/Anthropic/Z.ai sind Familien **ohne** Umsetzung; ihre Formen sind ungemessen | je Familie eine Messung |

### B. Betrieb und Sichtbarkeit

| # | Was fehlt | Folge |
|---|---|---|
| B1 | Das Plugin ist nicht im Profil eingehängt | Im GUI unsichtbar; nichts kaputt, aber nichts zu sehen |
| B2 | Kein Schattenstart (eigenes Home, eigene Ports) | Panel nie im echten Browser gelaufen — nur Bündel-Selbstprüfung und Client-Test |
| B3 | Kein Eintrag in `docs/status/plugin-installationsliste.md` | Wer die Liste liest, findet das Plugin nicht |

### C. Datenhaltung

| # | Was fehlt | Folge |
|---|---|---|
| C1 | Einträge in einer Datei, nicht in einer Tabelle | Mehrbenutzer braucht `user_id` + RLS — ein eigenes Paket, keine schnelle Migration |
| C2 | Kein Locking zwischen zwei Hosts | Zwei Hosts auf einem Home: der letzte Schreiber gewinnt |
| C3 | Keine Übernahme alter `*_API_KEY`-Referenzen in Einträge | Wer schon Schlüssel im Speicher hat, trägt sie von Hand ein |

### D. Schlüssel-Lebenszyklus

| # | Was fehlt | Folge |
|---|---|---|
| D1 | Keine Rotation mit Übergang (alt + neu parallel) | Ein Wechsel ist ein Ausfall, wenn ein Dienst den alten noch braucht |
| D2 | Kein Ablaufdatum, keine Erinnerung | Ein toter Schlüssel fällt erst beim Aufruf auf |
| D3 | Kein Verbrauch, keine Obergrenze je Schlüssel | Das Free-Tier-Problem („wieviel ist noch frei?") bleibt offen |
| D4 | Kein Audit-Log | „Wer hat den Schlüssel geändert?" ist nicht beantwortbar |
| D5 | Die Sonde erkennt keinen **ungültigen** Schlüssel (401 = unbekannt) | Richtig so — aber die Oberfläche sagt nicht ausdrücklich „Schlüssel ungeprüft" |

### E. Fähigkeiten

| # | Was fehlt | Folge |
|---|---|---|
| E1 | `zeitreihe`, `reranking`, `klassifikation` fehlen im Vertrag | Kronos/LSTM läßt sich eintragen, aber nicht als Fähigkeit wählen — bewußt nicht erfunden |

### F. Prüfung

| # | Was fehlt | Folge |
|---|---|---|
| F1 | Kein echter Hoststart | Die Profil-Verdrahtung (B1) ist ungeprüft |
| F2 | Kein echter Anbieteraufruf über die Sonde hinaus | Der Anbieteraufbau ist gegen den Vertrag geprüft, nicht gegen einen lebenden Dienst |
| F3 | Keine echte Postgres-Record-Prüfung | Die Record-Methoden sind im Provider geprüft, nicht mit diesem Paket zusammen |

## 3. Die eine Entscheidung, die A blockiert

**Zwei Orte kennen „das Modell": der Eintrag (`modelle`) und die Einstellungen (`wahl`).** Beides
zu mischen wäre der stille Fehler, den dieses Projekt vermeidet: ein Modell, das niemand gewählt
hat.

| Weg | Was er bedeutet | Preis |
|---|---|---|
| **A — Eintrag ist der Anbieter** | Eintrag trägt Schlüssel, Basis **und** Modelle; `wahl.anbieter` nennt die Eintrags-Kennung. Die Modellwahl in den Einstellungen wird für verwaltete Anbieter **bedeutungslos** und muß dort verschwinden oder gesperrt werden | Eintrags-Kennung muss die sein, die in `wahl` steht (Konvention: `openrouter`) |
| **B — Eintrag ist der Zugang** | Eintrag trägt Schlüssel, Basis und **welche Fähigkeiten er anbietet**; die Modellwahl bleibt **allein** in den Einstellungen. `standVon` fragt dann die Fähigkeit, nicht das Modell | Panel verliert die Modellauswahl; Eintragsformat ändert sich |

**Empfehlung: B.** Sie hält die eine Wahrheit dort, wo der Host sie schon hat (Settings → Models),
und der Verwalter tut, was sein Name sagt: Zugänge verwalten. A ist schneller, erzeugt aber genau
die zweite Wahrheit, die man später wieder ausbauen muß.

## 4. Reihenfolge, wenn es weitergeht

1. **Entscheidung B umsetzen** (Eintrag: `faehigkeiten` statt `modelle`; `standVon` ohne Modell).
   Danach ist der Verwalter widerspruchsfrei — auch ohne Anschluß.
2. **A1 anschließen**: `schluesselquelle` fragt zuerst `ctx.zugaenge.schluessel(id)`, dann den
   Credential-Speicher, dann die Umgebung; Basis aus dem Eintrag. Fallback bleibt vollständig.
3. **A4 beheben** (Hinweis im Formular: Chat läuft über den Kern).
4. **Erst messen, dann A3**: einen lokalen OpenAI-kompatiblen Dienst starten, `/v1/models`,
   `/v1/chat/completions`, `/v1/embeddings` mit **echten** Aufträgen prüfen, Feldnamen in die
   Familien-Tabelle schreiben — erst dann ein generischer Adapter.
5. **B1/B2**: Plugin ins Profil (Junction + `dsh.profile.bundles`), Schattenstart mit eigenem Home
   und eigenen Ports; Route und Panel prüfen; danach zurückbauen oder behalten.
6. **C1** nur, wenn Mehrbenutzer wirklich kommt — dann mit RLS und eigener Migrationsprüfung.
7. **E1** nur mit einem echten Verbraucher (Kronos), sonst bleibt der Vertrag bei sechs.

## 5. Was ausdrücklich NICHT gebaut wird

- **Kein geratener Adapter.** Feldnamen für TTS/STT/Bild eines unbekannten Dienstes zu erfinden
  wäre schlimmer als kein Adapter.
- **Keine Migration am Ende einer Sitzung.** `db-schema` ist geteiltes Terrain; eine Tabelle ohne
  RLS-Entwurf wäre eine halbe Mandantentrennung.
- **Kein stiller Rückfall.** Fehlt der Schlüssel, sagt der Stand „kein Schlüssel" — er nimmt nicht
  „irgendeinen".
