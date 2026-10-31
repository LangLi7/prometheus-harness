# @prometheus-harness/accounts

Konten als **eigenes DSH-Plugin**: ein Sidebar-Eintrag **Konten**, ein main-Panel mit Benutzerliste und Einladungen.

## Was das Panel zeigt

- **Benutzer** — alle Konten mit Adresse, Name, Rolle (Benutzer/Administrator), Zustand (aktiv/gesperrt) und Anlagedatum. Dazu **Sperren**/**Freigeben**.
- **Einladungen** — Gültigkeit (1 Stunde / 1 Tag / 7 Tage / 30 Tage), eine Notiz, dann **Einladung erzeugen**. Der Link erscheint **einmal** und läßt sich kopieren; offene Einladungen lassen sich zurücknehmen.
- Zustand jeder Einladung: **offen / eingelöst / abgelaufen / zurückgenommen**.

## Woher die Daten kommen

**Keine eigenen Routen.** Das Panel spricht mit den Wegen aus `@prometheus-harness/auth-http` auf **demselben Ursprung** (Sitzungskek und CSRF-Kek kommen so an):

| Weg | Zweck |
|---|---|
| `POST /api/pmh/auth/betreiber` | **automatisch**: aus dem Token des Wirts eine Sitzung für das Adminkonto |
| `GET /api/pmh/auth/me` | Wer bin ich? (Rolle) |
| `GET /api/pmh/auth/benutzer` | alle Konten |
| `POST /api/pmh/auth/benutzer/status` | sperren/freigeben (CSRF) |
| `GET /api/pmh/auth/einladungen` | die Einladungen des Admins |
| `POST /api/pmh/auth/einladungen/neu` | Einladung erzeugen (CSRF) |
| `POST /api/pmh/auth/einladungen/zuruecknehmen` | Link tot machen (CSRF) |

**Die automatische Erkennung.** Wer die Oberfläche über den Token des Wirts geöffnet hat (`…?token=…`), ist stärker als jedes Konto — er soll sich nicht ein zweites Mal anmelden. Das Panel fragt zuerst `/me`; kommt `401`, ruft es `/betreiber`, und der Server prüft den Token selbst (`authorizeIndex` des Kerns) und stellt eine Sitzung für das **einzige** Administratorkonto aus. Gibt es keines oder mehrere, sagt die Antwort warum (409) — dann führt der Weg einmal über die Anmeldeseite.

**Jede Regel entscheidet der Server**: Administratorprüfung, CSRF, „nicht sich selbst sperren", „nicht den letzten Administrator sperren", Gültigkeit und Einmal-Verbrauch der Einladung. Das Panel zeigt nur, was zurückkommt.

## Trennung der Daten

Jedes Konto hat seine eigenen Werke, Chats, Notizen, API-Schlüssel und Geheimnisse — getrennt über die Benutzerkennung (`user_id`), ein Teil zusätzlich über Row Level Security (`workspace_folders`, `conversation_sessions`, `session_events`). Deshalb zeigt die Liste **keine** fremden Daten an: das wäre ein Mandantenwechsel je Zeile.

## Die Anzeige einstellen

Seit dem 21.10.2026 läßt sich die Anzeige in den **Plugin-Einstellungen** einstellen — unter dem Eintrag `pmh-accounts`, nicht in einer zweiten Steuerung im Panel:

| Feld | Werte | Vorgabe |
|---|---|---|
| `surface` | `sidebar` · `plugins` · `both` · `none` | `sidebar` |
| `order` | 0–999, kleinere Zahl steht weiter oben | `12` |
| `label` | freier Text; leer heißt: der Text aus dem Sprachpaket | leer |

`plugins` meint die Karte in der Gruppe **Offiziell** der Plugin-Liste; `both` meldet beide Orte an. Die Felder stehen in der `Config` von [lib/index.js](lib/index.js) — die Einstellungsseite speist sich aus ihr, der Host liest die Werte aber **nicht**, er hält sie nur. Gelesen wird die Anzeige in der Browser-Hälfte über `ctx.configForms`.

**Keine `guide`-Angabe.** Anders als Usage meldet dieses Plugin keine Kachel auf dem Startbildschirm an; ein Feld dafür wäre eine Einstellung ohne Wirkung.

## Bauen

```powershell
bun run packages/plugin/accounts/build.mjs
```

## Installieren

Das Paket ist **Bündel und Plugin zugleich** (wie Obsidian und Graphify):

- `dsh.bundle.patch` → [cordis.patch.yml](cordis.patch.yml) fügt die Zeile `pmh-accounts` ein
- `dsh.client` → `lib/client.js` registriert `main:konten` und — je nach Einstellung — `sidebar.panellist:konten` bzw. `plugins.item:konten`
- `lib/index.js` → Knoten-Hälfte: sie hält die `Config` der Anzeige und meldet sonst kein Verhalten an

Installiert wird es als **lokales Verzeichnis** über das Plugin-Fenster („Plugin hinzufügen" → Verzeichnis) oder von Hand im Profil:

```jsonc
// profiles/web/package.json
"dependencies": { "@prometheus-harness/accounts": "link:C:/…/packages/plugin/accounts" },
"dsh": { "profile": { "bundles": [ /* … */ "@prometheus-harness/accounts" ] } }
```

danach `pnpm install` im Profilverzeichnis.

**Nicht zusätzlich in `scripts/profile-patch.mjs` eintragen.** Der Kern wirft bei doppelter Kennung `pmh-accounts`, und der Host startet dann nicht — dort steht deshalb ausdrücklich *„steht hier BEWUSST NICHT"*.

Nach einem Neustart erscheint der Eintrag **Konten** in der Seitenleiste; abschalten läßt er sich im Plugin-Fenster wie jedes andere Bündel.

