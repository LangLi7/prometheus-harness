# webui lokal starten (Referenz-Vorlage)

Wie man die Web-Oberfläche aus `H:\Projekt\Programmieren\Prometheus\webui` (Pfad wörtlich)
auf diesem Rechner zum Laufen bringt. Die Quelle selbst wird dabei nicht von Hand
verändert — es wird nur gestartet.

## Was die Oberfläche ist

- **Svelte 5 + Vite 8** (kein SvelteKit), Einstieg `src/main.js` → `src/App.svelte`.
- Titel der Seite: **Prometheus**.
- Bausteine: `src/lib/Universe.svelte` (G · Universe), `Terminal.svelte`, `Calendar.svelte`
  (FullCalendar), `Counter.svelte`; dazu `src/lib/api.js` als dünne Hülle über die
  Go-Endpunkte (`internal/web/web.go`): `/api/status`, `/api/history`, `/api/voice`,
  `/api/model`, `/api/settings`.
- `three` ist als Abhängigkeit vorhanden (3D/Graph), `marked` für Markdown.

## Starten (funktioniert)

```powershell
cd H:\Projekt\Programmieren\Prometheus\webui
node node_modules/vite/bin/vite.js --port 5174 --strictPort
```

**Aufruf im Browser: <http://localhost:5174/>**

- Kein `npm install` nötig — `node_modules/` ist vorhanden (Node v24.19.0).
- Kein Build nötig; es ist der Dev-Server mit HMR.
- `npm run dev` tut dasselbe (Port 5173), scheitert hier aber an der PowerShell-Execution-Policy
  (`npm.ps1` gesperrt). Deshalb der direkte Node-Aufruf.
- **Port 5173 ist auf diesem Rechner belegt** (dort läuft eine andere App: „Flowsint",
  React, Titel laut HTML). Also einen freien Port nehmen, z. B. 5174.
- Der Server bindet nur an **IPv6-Loopback**. `http://127.0.0.1:5174/` gibt
  „Verbindung verweigert", `http://localhost:5174/` antwortet mit **HTTP 200**. Der
  Netzwerk-Name `localhost` ist hier der richtige, nicht `127.0.0.1`.

## Bekannte Fallstricke

| Beobachtung | Ursache / Lösung |
|---|---|
| `Error: spawn EPERM` beim Laden von `vite.config.js`, `[plugin externalize-deps]` | Vite 8 (rolldown) bündelt die Konfiguration in einem Kindprozess; die DSH-Sandbox verbietet das. Nur außerhalb der Sandbox startbar. |
| `EPERM: operation not permitted, open '…\node_modules\.vite\_svelte_metadata.json'` | Das Svelte-Plugin schreibt seinen Optimierer-Zustand nach `node_modules/.vite/`. Braucht Schreibrecht auf den Projektordner. |
| `Port 5173 is already in use` | Belegt durch eine andere Anwendung; anderen Port wählen. |
| `127.0.0.1` antwortet nicht, `localhost` schon | Server hört nur auf `[::1]`. |
| API-Aufrufe scheitern (`/api/…`) | Der Go-Dienst gehört auf **Port 8080** (so steht es im Proxy von `vite.config.js`); er lief beim Test **nicht**. Ohne ihn zeigt die Oberfläche keine Daten. |

## Beim Test tatsächlich passiert

- Gestartet: `node node_modules/vite/bin/vite.js --port 5174 --strictPort`, Arbeitsverzeichnis
  `H:\Projekt\Programmieren\Prometheus\webui`, Vite **v8.1.5**, „ready in 622 ms".
- Geprüft: `/`, `/src/main.js`, `/src/App.svelte`, `/src/lib/Universe.svelte`,
  `/src/lib/Terminal.svelte`, `/src/lib/Calendar.svelte` → alle **HTTP 200**,
  Module werden als JavaScript ausgeliefert. Die Oberfläche lädt also.
- Angelegt wurde dabei nichts von Hand; der Dev-Server schreibt lediglich seinen eigenen
  Cache nach `node_modules/.vite/` (bereits vorhandener Ordner).
- Der Build-Pfad der Vorlage bleibt unberührt: `vite.config.js` würde mit
  `npm run build` nach `../internal/web/dist` schreiben (Go-Embed).

## Was der erste Seitenaufbau an Meldungen ausgibt

Beim Laden von `App.svelte` meldet der Svelte-Compiler eine ganze Liste — **nichts davon
verhindert den Start**, aber zwei Arten sind für uns wichtig:

| Art | Beispiel | Bedeutung für den Umbau |
|---|---|---|
| `non_reactive_update` | `App.svelte:41` `railEl`, `Calendar.svelte:8` `el` | Variablen werden geändert, sind aber nicht als `$state(...)` deklariert — echte Svelte-5-Falle, beim Nachbau prüfen |
| `a11y_*` | `<div>` mit Klick-Handler ohne Rolle/Tastatur, Autofokus, Label ohne Control | Barrierefreiheit der Vorlage ist schwach; bei uns von Anfang an richtig machen |
| `css_unused_selector` | viele `.term …`, `.cev …` in `App.svelte` | tote CSS-Reste — beim Aufräumen der Vorlage anfallender Ballast |

Fazit: Die Vorlage **läuft**, ist aber stilistisch gemischtes Material — als Anschauung
und Ideengeber brauchbar, als Codebasis für die neue Oberfläche nur nach Aufräumen.
