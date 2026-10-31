---
description: "Führt durch einen MiroFish-Lauf mit kleinem Budget — Projekt, Graph, Simulation, Runden, Report, inklusive Abbruchkriterien."
argument-hint: "[seed-datei]"
---

# MiroFish-Lauf starten

Voraussetzung: `mirofish-check` ist grün (`health` zeigt Backend 5001 und
Frontend 3000).

1. `http://127.0.0.1:3000` öffnen.
2. Projekt anlegen und den Seed (`mirofish-seed.md`) hochladen.
3. Graph bauen (Zep). Das ist der teuerste Schritt — einmal bauen, mehrfach
   simulieren.
4. Simulation anlegen; Twitter **und** Reddit nur, wenn beide gebraucht werden
   (kostet doppelt).
5. Profile vorbereiten.
6. Start mit **20–30 Runden**. Kein erster Lauf mit 40+.
7. Nach dem Lauf Report generieren.

Notiere `simulation_id` und `report_id` aus der URL.

**Abbruchkriterien:** Fehler beim Graph-Bau, leere Persona-Liste, ein Lauf ohne
neue Posts über mehrere Runden, oder ein Kostenhinweis im Log. In diesen Fällen
stoppen, `check` erneut laufen lassen und den Befund nennen — nicht blind
wiederholen.

Fasse am Ende zusammen: Runden, Anzahl Personas, Dauer, geschätzte Kosten, IDs.
