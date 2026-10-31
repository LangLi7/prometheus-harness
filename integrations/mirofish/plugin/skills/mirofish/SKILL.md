---
name: mirofish
description: Nutzt MiroFish als synthetische Zielgruppe für Website- und Positionierungs-Tests — aus einer Seite wird ein Seed-Dossier, daraus eine Schwarm-Simulation mit Personas, daraus ein Report über erste Eindrücke, Einwände, Preiswahrnehmung und Botschaften. Verwende diese Skill, wenn jemand eine Website, Landingpage oder Kampagne vor dem Launch auf Reaktionen testen will, wenn MiroFish genannt wird, oder wenn es um „wie kommt das an" statt um Klickzahlen geht.
---

# MiroFish — synthetische Zielgruppe für Websites

## Was es ist

MiroFish ist eine **Schwarm-Simulations-Engine**, kein Website-Analysator. Aus
Seed-Material baut sie einen Persona-Graphen und lässt hunderte Agenten mit
eigener Erinnerung in einer Twitter-/Reddit-Umgebung interagieren; am Ende steht
ein Report. Für Website-Arbeit ist der sinnvolle Einsatz: **Reaktionen testen,
bevor echte Nutzer sie liefern** — Botschaft, Preis, Beweise, Einwände.

**Nicht dafür:** Usability, Ladezeiten, Conversion-Zahlen, SEO, Recht. Das sind
Messungen an echten Nutzern oder Crawler-Aufgaben; MiroFish erfindet sie nicht,
sondern simuliert Meinungen.

## Wann es sich lohnt

| Frage | MiroFish |
|---|---|
| „Glauben Leute diesem Versprechen?" | ja, als Simulierung |
| „Welcher Einwand kommt zuerst?" | ja |
| „Wirkt der Preis teuer — und warum?" | ja |
| „Welche Botschaft würde geteilt?" | ja, mit Vorsicht |
| „Ist der Button groß genug?" | nein |
| „Wie viele Leads bringt das?" | nein |

## Voraussetzungen

- Node 18+, Python 3.11–3.12, `uv` (oder Docker).
- `MiroFish/.env` mit **`LLM_API_KEY`** (OpenAI-kompatibel) und **`ZEP_API_KEY`**
  (Zep Cloud, kostenloses Kontingent reicht für kleine Läufe).
- Ports `3000` (Frontend) und `5001` (Backend).
- Lizenz **AGPL-3.0**: als eigenständiger Dienst nutzen, nicht in PMH kopieren.

## Einrichtung

```bash
git clone https://github.com/666ghj/MiroFish.git C:\Users\Chang\MiroFish
cd C:\Users\Chang\MiroFish
bun <plugin>/scripts/mirofish.mjs env-template --dir .
# Werte in .env eintragen (LLM + Zep)
npm run setup:all
npm run dev
```

Danach prüfen:

```bash
bun <plugin>/scripts/mirofish.mjs check --dir C:\Users\Chang\MiroFish
```

`check` nennt jeden fehlenden Punkt einzeln und endet mit Exit-Code 1, solange
etwas blockiert. Es gibt keine stillen Fehlschläge.

## Website-Workflow

### 1. Seed bauen

```bash
bun <plugin>/scripts/mirofish.mjs seed ./mein-projekt --out mirofish-seed.md
bun <plugin>/scripts/mirofish.mjs seed https://beispiel.ch --out mirofish-seed.md
```

Das Skript zieht `design.md`, `README.md`, `index.html` (oder die URL) und legt
ein Dossier an. Die Felder **Zielgruppen**, **Beweise**, **Preis-Einwand** und
**Wettbewerber** sind mit `TODO` markiert — sie müssen aus dem Projekt ergänzt
werden, sonst simuliert MiroFish leere Personas.

Regeln für den Seed:

- Drei Segmente, je mit Motivation, Einwand und Sprache.
- Ein Hauptversprechen, drei Beweise, ein Preis.
- Keine Personendaten, keine Kundenmails, keine internen Dokumente.
- Unter 9.000 Zeichen; MiroFish schneidet sonst.

### 2. Simulation starten

Im Frontend (`http://127.0.0.1:3000`):

1. Projekt anlegen, `mirofish-seed.md` hochladen.
2. Graph bauen (Zep) — das ist der teuerste Schritt.
3. Simulation anlegen (Twitter + Reddit).
4. Profile vorbereiten, dann starten: **20–30 Runden**, nicht 40+ beim ersten Lauf.
5. Report generieren.

Notiere die `simulation_id` und `report_id` aus der URL — der Report-Befehl
braucht sie.

### 3. Report in Entscheidungen übersetzen

Der Report liefert Meinungen, keine Wahrheiten. Übernimm nur, was eine
Design-Entscheidung ändert:

| Report-Aussage | Design-Entscheidung |
|---|---|
| „Wirkt wie eine Agentur-Seite" | Beweise nach oben: echte Namen, Zahlen, Demo |
| „Preis kommt vor dem Wert" | Preissektion nach den Beweisen, Wert zuerst |
| „Versprechen ist zu groß" | Hauptversprechen auf eine messbare Zusage kürzen |
| „Zweiter Einwand: Datenschutz" | Datenschutz-Sektion mit einem Satz + Link |
| „Diese Formulierung wird geteilt" | Headline-Kandidat in A/B-Test |

Schreibe die Ergebnisse in `design.md` §7 (Offene Entscheidungen) oder in eine
Notiz — nicht in Code, der später als Tatsache gelesen wird.

## Befehle

```bash
bun <plugin>/scripts/mirofish.mjs check --dir <MiroFish>
bun <plugin>/scripts/mirofish.mjs seed <ordner|url> --out mirofish-seed.md
bun <plugin>/scripts/mirofish.mjs health
bun <plugin>/scripts/mirofish.mjs env-template --dir <MiroFish>
bun <plugin>/scripts/mirofish.mjs urls
```

## Kosten und Grenzen

- **LLM-Tokens und Zep-Kontingent** werden verbraucht; 120–200 Personas über
  20–30 Runden sind kein Gratis-Lauf. Erst klein testen.
- **Synthetische Reaktionen sind keine echten Nutzer.** Sie eignen sich zum
  Finden von Einwänden und Formulierungen, nicht zum Prognostizieren von Umsatz.
- **AGPL-3.0**: Der Dienst bleibt getrennt; keine Codeübernahme ins Harness.
- **Keine personenbezogenen Daten** hochladen. Der Seed ist Marketingmaterial.

## Dateien

- `scripts/mirofish.mjs` — Prüfen, Seed bauen, `.env`-Vorlage.
- `references/seed-template.md` — Aufbau des Dossiers.
- `references/api.md` — HTTP-Endpunkte für automatisierte Läufe.
