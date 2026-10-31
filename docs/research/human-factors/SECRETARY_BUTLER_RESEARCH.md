# Deep Research: Der digitale Sekretär / Butler ("Jarvis") für Prometheus

> Stand: Juli 2026 · Zielsystem: lokaler 24/7 Go-Agent (Raspi 5 / NixOS), Push via ntfy/Telegram, Kalender via CalDAV/ICS, alles lokal & privat. Kernziel: **ADHS-Executive-Function-Support**.

---

## 1. Was macht ein echter menschlicher Sekretär / Executive Assistant?

Aus Stellenprofilen (Executive Assistant, Chief of Staff, klassische Sekretariatsausbildung) destilliert:

| Kernaufgabe | Was der Mensch konkret tut | Warum es Wert schafft |
|---|---|---|
| Kalenderhoheit | Termine legen/verschieben, Konflikte lösen, Pufferzeiten, Reisezeit einplanen | Chef denkt nie über Logistik nach |
| Gatekeeping | Anfragen filtern: was erreicht den Chef, was nicht, was wird delegiert | Schutz der Aufmerksamkeit |
| Follow-up-Disziplin | "Warten auf"-Liste führen, nachhaken bis erledigt | Nichts fällt durch die Ritzen |
| Briefing | Morgens: heutige Termine, Teilnehmer, Kontext, Unterlagen | Chef ist immer vorbereitet |
| Priorisierung | To-dos sortieren, Deadlines im Blick, "das zuerst" | Entlastung des Arbeitsgedächtnisses |
| Vorbereitung | Reisen buchen, Recherche vor Meetings, Dossiers über Personen | Kontext auf Abruf |
| Gedächtnis | Wer ist wer, Geburtstage, letzte Gespräche, offene Zusagen | Beziehungspflege, Kontinuität |
| Proaktivität | Erinnern BEVOR es brennt ("in 2 Wochen läuft X ab") | Antizipation statt Reaktion |

**Kernerkenntnis:** Der Wert eines Sekretärs liegt nicht in einzelnen Aktionen, sondern darin, dass er ein **externes Arbeitsgedächtnis mit eigenem Antrieb** ist. Genau das ist bei ADHS das Defizit (Barkley: "prosthetic executive function"). Prometheus sollte als Prothese für Exekutivfunktionen designt werden, nicht als Chatbot.

---

## 2. Existierende AI-Assistants — was sie können, was fehlt

| Produkt | Kernfeature | Übertragbar auf Prometheus | Schwäche |
|---|---|---|---|
| **Google Assistant Routines** | Trigger (Zeit/Ort/Event) → Aktionskette ("Guten Morgen": Wetter, Termine, News) | Cron-getriggerte Routinen-Pipelines (YAML-definiert) | Rein reaktiv auf Trigger, kein Gedächtnis |
| **Siri Shortcuts** | User-definierte Automationen, Verkettung von Apps | Konfigurierbare "Rezepte" statt hardcoded Features | Kein Eigenantrieb |
| **Alexa Hunches** | Proaktive Anomalie-Erkennung ("Licht ist noch an, du gehst sonst um 23 Uhr ins Bett") | Muster lernen → proaktive Nudges bei Abweichung ("Du hast Task X 3 Tage nicht angefasst") | Cloud, gruselig ohne Transparenz |
| **Motion** | AI-Autoplanung: Tasks werden automatisch in Kalenderlücken geplant, Auto-Reshuffle bei Konflikten, Deadline-getrieben | **Auto-Timeboxing**: offene Tasks in freie ICS-Slots legen | Reshuffled zu aggressiv, User verliert Kontrolle |
| **Reclaim.ai** | Habits (wiederkehrende flexible Blöcke), Focus Time schützen, Buffer Time, Priorisierungsregeln | Habit-Blöcke + Fokuszeit-Schutz im CalDAV; Regeln statt Vollautomatik | Nur Google/Outlook, Cloud |
| **Clara / x.ai (eingestellt)** | E-Mail-CC an Assistent → verhandelt Termine per Mail-Ping-Pong | Terminverhandlung via Telegram/Mail-Draft (Mensch bestätigt) | Zu enger Scope, als Standalone gescheitert → Lektion: Scheduling allein trägt kein Produkt |
| **Lindy** | No-Code-Agenten: Trigger → LLM-Workflow (Mail-Triage, Meeting-Prep, Recherche) | Agenten-Templates: definierter Trigger, definierter Workflow, LLM als Baustein | Cloud, teuer |
| **Dola / Kalender-Bots** | Kalender komplett im Messenger: Freitext/Foto/Voice → Termin, Erinnerungen im Chat | **Telegram als primäres UI**: Freitext → ICS-Event, alles im Chat | Kein Task-/Kontextmodell |

**Muster über alle Produkte:** (1) Trigger→Aktion-Pipelines, (2) Kalender als zentrale Wahrheit, (3) Chat als Interface, (4) die Guten sind *proaktiv mit Bestätigungsschleife* (Vorschlag → User approved → Ausführung). Vollautomatik (Motion) frustriert; reine Reaktivität (Siri) hilft ADHS nicht.

---

## 3. Kategorien → konkrete Features für den lokalen Go-Agent

Architektur-Grundannahme für alle Kategorien:
- **Cron-Loop:** Go-Daemon mit internem Scheduler (z. B. `robfig/cron` oder simpler Ticker-Loop), Jobs als Registry.
- **Push:** ntfy (`POST http://ntfy/topic`) für stille Infos, Telegram-Bot (long polling) für interaktive Dialoge (Buttons = Bestätigungsschleife).
- **Kalender:** CalDAV-Client (z. B. `emersion/go-webdav/caldav`) gegen Radicale/Nextcloud lokal; ICS-Parsing mit `arran4/golang-ical`.
- **Speicher:** SQLite als einziges Statebackend (Tasks, Personen, Log, "Warten auf").

### 3.1 Kalender / Terminplanung

| Feature | Umsetzung |
|---|---|
| Termin per Freitext anlegen | Telegram: "Zahnarzt Di 14 Uhr" → LLM-Parse → VEVENT via CalDAV PUT, Rückfrage bei Ambiguität |
| Konflikterkennung | Cron alle 15 min: ICS der nächsten 7 Tage laden, Überlappungen → Telegram-Warnung mit Buttons (verschieben/ignorieren) |
| Pufferzeiten & Reisezeit | Regel: vor Terminen mit Ort automatisch Block "Anfahrt" einfügen (konfigurierbare Default-Dauer) |
| Auto-Timeboxing (Motion-Stil) | Tasks mit Dauer+Deadline → freie Slots suchen → als *Vorschlag* per Telegram, erst nach OK ins ICS |
| Habit-Blöcke (Reclaim-Stil) | Wiederkehrende flexible Blöcke ("3× Woche Sport"), die bei Konflikt selbst neue Slots suchen |

### 3.2 Erinnerungen / Follow-ups

| Feature | Umsetzung |
|---|---|
| Natürliche Erinnerungen | "Erinnere mich Freitag an X" → Row in SQLite (`remind_at`), Cron-Loop feuert ntfy/Telegram |
| "Warten auf"-Liste | `waiting_for(person, thema, seit, naechster_ping)` — Agent hakt beim USER nach: "Hat Anna geantwortet? [Ja/Nein/Nochmal fragen]" |
| Eskalierende Erinnerung | Snooze-Buttons; unbeantwortete Erinnerungen wiederholen sich mit steigender Priorität (ntfy priority header) |
| Vorlauf-Erinnerungen | Termine mit Vorbereitungsbedarf: T-7/T-1/T-2h-Pings (pro Termin-Kategorie konfigurierbar) |
| Fristen-Radar | Wiederkehrende Deadlines (Versicherung, TÜV, Abos) in SQLite mit langem Vorlauf ("in 30 Tagen läuft X ab") |

### 3.3 E-Mail / Kommunikations-Triage

| Feature | Umsetzung |
|---|---|
| Posteingang-Triage | IMAP-Poll (Cron, 10 min) → lokales LLM/Regeln klassifizieren: dringend / braucht Antwort / Info / Müll |
| Nur-Wichtiges-Push | Nur "dringend/Antwort nötig" → Telegram mit 1-Satz-Zusammenfassung; Rest in Tagesbriefing sammeln |
| Antwort-Entwürfe | Bei "braucht Antwort": Draft generieren, per Telegram zeigen, User editiert/bestätigt → SMTP-Versand |
| Follow-up-Detektor | Gesendete Mails mit Frage, keine Antwort nach N Tagen → auf "Warten auf"-Liste |
| Phase-später: Kanäle bündeln | Telegram-Weiterleitungen, RSS etc. in dieselbe Triage-Pipeline |

### 3.4 Tagesbriefing

| Feature | Umsetzung |
|---|---|
| Morgenbriefing (Cron 07:30) | Eine Telegram-Nachricht: heutige Termine (ICS), Top-3-Tasks, offene "Warten auf", Wetter (open-meteo), gestern Liegengebliebenes |
| Abend-Review (Cron 21:00) | "Was ist erledigt? Was wandert auf morgen?" — Buttons pro offenem Task; Basis fürs nächste Morgenbriefing |
| Meeting-Vorbriefing | 30 min vor Termin: Kontext aus Personen-/Projektgedächtnis + letzte Notizen zu dem Termin |
| Wochenvorschau (So 18:00) | Nächste Woche: Termine, Deadlines, Fristen-Radar-Hits |

### 3.5 Aufgaben-Priorisierung — **ADHS-Executive-Function-Kern** ⭐

Das ist das Differenzierungsmerkmal von Prometheus. ADHS-Defizite: Task-Initiierung, Arbeitsgedächtnis, Zeitblindheit, Priorisierung unter Overwhelm.

| Feature | Umsetzung |
|---|---|
| **"Nächster kleinster Schritt"** | Statt Taskliste zeigen: Agent nennt genau EINEN Task und zerlegt ihn per LLM in einen <10-min-Startschritt ("Öffne die Datei und lies die erste Fehlermeldung"). Anti-Overwhelm: nie mehr als 3 Tasks gleichzeitig zeigen. |
| **Body-Doubling-Modus** | `/focus 25` → Agent startet Timeboxing-Session: Start-Ping, Mittendrin-Check ("Noch dran? 👀"), End-Ping mit Mini-Review. Der Agent "sitzt daneben" (Barkley: prosthetische Exekutivfunktion). Streak-Tracking als Dopamin-Belohnung. |
| **Timeboxing** | Jeder Task bekommt eine geschätzte Dauer; Agent vergleicht Schätzung vs. Realität → lernt persönlichen Planungsfaktor ("du brauchst im Schnitt 1,8×") |
| **Task-Kapern-Erkennung** | Task, der >3 Tage in "in Arbeit" hängt → Agent fragt: blockiert / zu groß (→ zerlegen) / nicht mehr wichtig (→ löschen)? Nie stumm verrotten lassen. |
| **Zeitblindheits-Anker** | Vor Terminen: "Termin in 45 min — jetzt noch max. 1 kleiner Task, kein Deep Work mehr" |
| **Frustfreier Capture** | Alles per Telegram-Freitext in eine Inbox; Sortierung macht der Agent später (Triage-Dialog abends). Capture darf NIE Reibung haben. |
| **Overwhelm-Notbremse** | Kommando `/panik`: Agent blendet alles aus, wählt selbst den einen wichtigsten machbaren Schritt und begleitet ihn im Body-Doubling-Modus |

### 3.6 Proaktive Check-ins

| Feature | Umsetzung |
|---|---|
| Stille-Erkennung (Alexa-Hunches-Prinzip) | Keine Interaktion seit X Stunden während Arbeitszeit → sanfter Ping "Woran arbeitest du gerade?" (Frequenz lernbar, abschaltbar) |
| Muster-Nudges | Abweichung von Routinen erkennen ("Sport-Block heute geskippt — verschieben auf morgen 17 Uhr?") |
| Energie-adaptiv | Check-in fragt gelegentlich Energielevel (1–5 Buttons) → beeinflusst Task-Vorschläge (low energy → nur Mini-Tasks anbieten) |
| Respekt-Regeln | Ruhezeiten hart konfiguriert (nachts nie), max. N proaktive Pings/Tag, jeder Ping mit "seltener"-Button → Agent nervt nie |

### 3.7 Reise- / Recherche-Vorbereitung

| Feature | Umsetzung |
|---|---|
| Termin-Dossier | Termin mit unbekannter Person/Firma → Cron am Vorabend: Websuche + eigenes Gedächtnis → Kurzprofil ins Vorbriefing |
| Reise-Checkliste | Event mit Reise-Tag → Template-Checkliste (Ticket, Unterkunft, Packliste) als Tasks mit Vorlauf-Deadlines |
| Recherche-Aufträge | "Recherchier mir X bis morgen" → Background-Job (Websuche + LLM-Zusammenfassung), Ergebnis als Markdown + Telegram-Link |
| Wetter/Anfahrt am Termintag | Morgens für Termine mit Ort: Wetter + grobe Fahrzeit ins Briefing (open-meteo, OSRM lokal möglich) |

### 3.8 Kontext-Gedächtnis über Personen / Projekte

| Feature | Umsetzung |
|---|---|
| Personen-Registry | SQLite: `person(name, rolle, letzte_interaktion, notizen[], geburtstag)` — gefüttert per Telegram ("Merk dir: Anna mag keine Vormittagstermine") und automatisch aus Mails/Terminen |
| Projekt-Kontexte | `projekt(name, status, offene_tasks, letzte_aktivität, notizen)` — Tasks/Mails/Termine werden Projekten zugeordnet |
| Abrufbarkeit | "/wer Anna" → Dossier; Meeting-Vorbriefing zieht automatisch daraus |
| Zusagen-Tracking | Aus Chat/Mails extrahierte eigene Zusagen ("ich schick dir das bis Freitag") → automatisch Task + Follow-up |
| Wiederauftauchen | Person nach langer Pause wieder im Kalender → "Letztes Treffen vor 4 Monaten, damals ging es um X" |
| Langzeit: Vektor-Suche | Notizen embedden (lokales Embedding-Modell) für semantisches "Was weiß ich über…?" — erst wenn SQL-LIKE nicht mehr reicht |

---

## 4. Roadmap-Empfehlung

### Phase 1 — Das Rückgrat (der zuverlässige Erinnerer)
*Ziel: Prometheus ist nach Phase 1 bereits täglich unverzichtbar.*
1. Go-Daemon mit Cron-Loop + SQLite + Telegram-Bot (Commands & Buttons) + ntfy
2. Capture-Inbox per Freitext (3.5)
3. Erinnerungen mit Snooze/Eskalation (3.2)
4. CalDAV read-only: Termine lesen, Vorlauf-Pings
5. **Morgenbriefing + Abend-Review** (3.4) — der tägliche Herzschlag

### Phase 2 — Der Exekutivfunktions-Coach (ADHS-Kern)
1. Task-Modell mit Dauer/Deadline/Projekt; "nächster kleinster Schritt" per LLM (3.5)
2. Body-Doubling-/Focus-Sessions + Timeboxing mit Planungsfaktor-Lernen (3.5)
3. CalDAV schreibend: Freitext→Termin, Auto-Timeboxing als Vorschlag (3.1)
4. Proaktive Check-ins mit Respekt-Regeln + Overwhelm-Notbremse (3.6)
5. "Warten auf"-Liste + Fristen-Radar (3.2)

### Phase 3 — Der Butler mit Gedächtnis
1. Personen-/Projekt-Registry + Zusagen-Tracking (3.8)
2. E-Mail-Triage + Antwort-Drafts + Follow-up-Detektor (3.3)
3. Meeting-Vorbriefings mit Dossiers, Recherche-Aufträge, Reise-Checklisten (3.7, 3.4)
4. Muster-Lernen (Hunches): Routine-Abweichungen, Energie-Adaption (3.6)
5. Optional: Vektor-Gedächtnis, Habit-Blöcke mit Auto-Reschedule

### Leitprinzipien (aus dem Marktvergleich destilliert)
1. **Vorschlagen, nicht diktieren** — jede automatische Kalenderänderung braucht einen Bestätigungs-Button (Motions Hauptkritikpunkt vermeiden).
2. **Capture reibungsfrei, Triage später** — ADHS-Regel Nr. 1.
3. **Ein Herzschlag statt hundert Features** — Morgenbriefing/Abend-Review sind der Vertrag zwischen Agent und User; alles andere hängt sich dort ein.
4. **Proaktiv, aber höflich** — harte Ruhezeiten, Ping-Budget, jeder Nudge abschwächbar. Ein nervender Butler wird stummgeschaltet und ist damit tot.
5. **Lokal first** — SQLite + CalDAV + IMAP + ntfy reichen für alles bis Phase 3; keine Cloud-Abhängigkeit nötig (Lektion aus dem Clara/x.ai-Aus: kontrollierbare eigene Infrastruktur statt fremder Dienst).
