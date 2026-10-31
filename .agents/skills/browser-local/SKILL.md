---
name: browser-local
description: "Einen echten, lokalen Chromium über CDP bedienen: klicken, tippen, navigieren, Screenshots, JS-gerenderte oder angemeldete Seiten. Nicht fürs bloße Abrufen öffentlicher Seiten (dafür web_fetch) und nicht fürs Suchen (dafür SearXNG)."
---

# browser-local

Ein Browser auf dieser Maschine, gesteuert über Python-Snippets von
[Browser Use](https://github.com/browser-use/browser-use) (Paket `browser_harness`,
CLI-Pfad). Kein Cloud-Konto, kein Remote-Daemon, kein Modellschlüssel — die
direkte Steuerung ruft kein Modell auf.

## Wann

- Die Seite braucht **JavaScript** und `web_fetch` liefert nur eine Hülle.
- Es muss **geklickt, getippt, gescrollt** oder ein Formular ausgefüllt werden.
- Es geht nur **angemeldet** (bestehende Sitzung im Profil).
- Ein **Screenshot** oder der **AX-Baum** soll die Grundlage sein.
- **Localhost und das eigene Netz** — dieser Weg prüft kein Ziel. Gemessen am
  21.10.2026: `http://127.0.0.1:3080/` liefert „Anmeldung — Prometheus Harness",
  `http://127.0.0.1:8081/` liefert „SearXNG". Auch die Harness-Oberfläche selbst
  ist also erreichbar — der eingebettete Panel-Browser kann das **nicht**.
- Öffentliches Web genauso; der Browser ist kein Intranet-Werkzeug.

## Wann nicht

- Öffentliche Seite lesen → `web_fetch` (schneller, billiger).
- Etwas finden → SearXNG (`http://127.0.0.1:8081`, JSON). Ein Browser, der eine
  Suchmaschine bedient, ist der teuerste Weg zu einer Trefferliste.
- Reine API → `curl`/`web_fetch`.
- **`research_fetch` statt dessen für localhost?** Nein: dessen Zielschutz lehnt
  private Bereiche ab (`Ziel abgelehnt (privater Bereich 127.0.0.0/8)`), solange
  `PMH_RESEARCH_PRIVAT` nicht `1` ist. Wer den Schutz dort abschaltet, schaltet
  ihn für **alle** Aufrufe dieses Dienstes ab.

## Aufruf

```sh
node scripts/browser-local.mjs --check            # läuft der Browser? welche Fassung?
node scripts/browser-local.mjs --code datei.py    # Snippet ausführen
```

Das Skript startet Chromium bei Bedarf (Port **9334**, headless, Profil unter
`.pmh-build/browseruse/profiles/agent`) und reicht das Snippet über stdin an
`uvx --from 'browser-use[cli]' browser-use`. Erster Aufruf nach längerer Pause
dauert ~10 s (uvx-Auflösung), danach wenige Sekunden.

## Rezepte

```python
# Navigieren und lesen
new_tab("https://example.com")
wait_for_load()
info = page_info()                 # url, title, w, h, Scrollposition
print(info["title"])
print(" ".join(js("document.body.innerText").split())[:2000])

# Elemente finden: AX-Baum statt Screenshot
nodes = cdp("Accessibility.getFullAXTree")["nodes"]
for n in nodes:
    if n.get("role", {}).get("value") in ("button", "link", "textbox"):
        print(n.get("name", {}).get("value"), n.get("backendDOMNodeId"))

# Klicken: AX-Knoten -> Box-Mitte -> Koordinate
q = cdp("DOM.getBoxModel", backendNodeId=123)["model"]["content"]
x, y = sum(q[0::2]) / 4, sum(q[1::2]) / 4
click_at_xy(x, y)

# Tippen
click_at_xy(x, y)
type_text("Suchbegriff")
press_key("Enter")

# Screenshot
png = screenshot()                 # Bytes; mit open(...) speichern
open(".pmh-build/bild.png", "wb").write(png)

# Tabs
print(list_tabs())
switch_tab(1)
```

## Regeln

- **Ein Tab je Aufgabe.** `new_tab()` nur für die erste Navigation; danach
  `current_tab()`/`list_tabs()` prüfen und `switch_tab()` wiederverwenden.
  Fremde Tabs nicht schließen.
- **Anmeldung ist eine Grenze.** Bei Passwort, MFA, Zustimmung oder unklarer
  Kontowahl anhalten und fragen. Eine bereits angemeldete Sitzung darf genutzt
  werden.
- **Nach jeder Aktion prüfen** — `page_info()` oder ein gezieltes `js(...)`, nicht
  annehmen, dass der Klick gewirkt hat.
- **Koordinaten sind Viewport-Pixel.** Negative oder zu große Werte heißen:
  erst scrollen.
- **Kein `autonomous agent`.** Kein `retry_with_browser_use_agent`, kein Cloud-
  Daemon: der Taskloop bleibt hier, nicht in einem zweiten Agenten.

## Fehler

| Meldung | Bedeutung |
|---|---|
| `DevToolsActivePort not found` | Port 9334 antwortet nicht — `--check` neu laufen lassen (startet den Browser) |
| `daemon default didn't come up` | Daemon-Log unter `.pmh-build/browser-harness/tmp/bu-default.log` |
| `Connection closed` | das ist der **MCP**-Pfad, nicht dieser; der MCP-Eintrag `browser-use` ist deshalb abgeschaltet (`scripts/profile-patch.mjs`) |
