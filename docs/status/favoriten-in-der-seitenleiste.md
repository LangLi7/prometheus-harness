# Favoriten in der Seitenleiste — kein eigener Tab

> **Stand:** 28.10.2026 · **Auftrag:** *„ich möchte das man den einzelne chat favorisieren kann um
> es per sortieren schneller sehen kann im zb einzelne workspaces anzeigen & wenn du schon drann
> bist kannst du auch eine möglichkeit bringen in workspaces chat sortieren zu können?"* — und,
> nach dem ersten Fehlversuch: *„es sollte gar keine tap von dem geben lol"* sowie, auf die Frage
> nach dem Bündel: *„es sollte intern dazu gehören"*.
>
> **Was hier belegt wird:** warum der erste Versuch (ein Panel) verworfen ist, was stattdessen in
> der Seitenleiste steht, und wie die Änderung einen `bun install` überlebt.

---

## 1. Der Fehlversuch — und warum er verworfen ist

Gebaut war ein eigenes Panel `favorites` (`main:favorites`, Stern in der Panelleiste) mit Lesen,
Filtern und Sortieren. **Das war falsch.** Es beantwortete „Übersicht über alle Arbeitsbereiche",
gefragt war aber „in der Liste schneller sehen". Ein leerer Tab für eine Funktion, die an der Zeile
sitzt, ist keine Funktion, sondern eine Ausrede — und `client-tabs` ist aus demselben Grund in
`scripts/profile-patch.mjs` schon wieder auskommentiert.

**Zurückgebaut, spurlos:** Paket `packages/client/favorites` gelöscht, Zeile und Kommentar in
`scripts/profile-patch.mjs` entfernt, `docs/status/favoriten-flaeche.md` und die INDEX-Zeile
gelöscht, `bun install` (entfernt 1 Paket), Profilprüfung **39 pass**.

---

## 2. Was die Funktion schon war

Das Favorisieren **gab es bereits** — es hieß nur „anheften" und war an der Nadel beim Überfahren
der Zeile zu finden:

| Was | Wo |
|---|---|
| Anheften/Abheften je Sitzung | Menü „…" (`PinSessionMenuItem`) und Knopf beim Überfahren (`PinSessionRowButton`) |
| Menge, die der Wirt über Neustarts hält | `pinnedSessionIds` in `WorkspaceSnapshot` |
| Angeheftete Zeilen führen ihre Gruppe | `sectionMembers` im Seitenleisten-Bündel |
| Sortieren | Ansichtsmenü: „Manuell" (Ziehen) und „Zuletzt aktualisiert" |
| Einen Arbeitsbereich zeigen | Gruppe zuklappen, andere bleiben zu |

Was fehlte: **eine Möglichkeit, nur die Favoriten zu sehen** — und ein Wort, das man versteht.

---

## 3. Was jetzt gebaut ist

Alles **in der Seitenleiste**, kein Panel, kein Tab:

| Teil | Ort | Änderung |
|---|---|---|
| **Wort** | `packages/client/locale/de.json` | „Sitzung anheften" → **„Zu Favoriten"**, „Anheftung aufheben" → **„Aus Favoriten entfernen"**, Marker „Angeheftet" → **„Favorit"**, beide Fehlermeldungen entsprechend |
| **Filter** | `node_modules/…/dsh-client-ui-workspace/lib/client.js`, angewendet durch `scripts/client-favoriten.mjs` | im Ansichtsmenü unter den Archivfiltern: **„Nur Favoriten"** — Sichtungs-Store-Feld `favoritesOnly`, Aktion `setFavoritesOnly`; bei gesetztem Filter gilt alles Nicht-Angeheftete als verdeckt (dieselbe Mechanik wie „Archivierte ausblenden", keine zweite Filterlogik) — in Gruppen, flacher Liste **und** Suche |

**Warum kein zweiter Favoriten-Zustand.** Der Filter liest die Anheftung des Wirts. Es gibt keine
zweite Markierung, keine zweite Speicherung, keine zwei Wahrheiten — nur eine andere Sicht auf
dieselbe Menge.

**Warum die Änderung im Bündel steht und nicht als Plugin.** Die Seitenleiste gibt für Zeilen nur
Menüeintrag und Hover-Knopf als Slots her; das Ansichtsmenü ist **kein** Slot. Der Betreiber hat
entschieden, daß dieses Bündel „intern dazu gehört" — also wird es geändert, aber nachvollziehbar.

**Wie es einen `bun install` überlebt.** `node_modules` ist nicht versioniert. Die Änderung steht
deshalb als Ersetzungsliste in `scripts/client-favoriten.mjs` (14 Schritte, je ein Anker, der
**genau einmal** passen muß) und wird bei **jedem Start** erneut angewendet
(`scripts/start.mjs`, nach dem Profil-Eintrag). Vor dem Schreiben wird geprüft; paßt ein Anker
nicht mehr, wird **nichts** geändert und der Start meldet es:

```
[pmh] WARNUNG: Favoriten-Filter — Der Filter paßt nicht mehr auf dieses Bündel — nichts geändert.
[pmh]   Menü: Eintrag und Auswahl: Anker 0× gefunden, erwartet 1
```

Von Hand: `bun scripts/client-favoriten.mjs` (anwenden) · `--pruefen` (nur prüfen).

---

## 4. Was gemessen ist

| Prüfung | Befehl | Ergebnis |
|---|---|---|
| Syntax des gepatchten Bündels | `node --check node_modules/@deepseek-ai/dsh-client-ui-workspace/lib/client.js` | **exit 0** |
| Anwendung, idempotent | `bun scripts/client-favoriten.mjs --pruefen` | **exit 0**, „schon angewendet" |
| Deutsche Texte, gültiges JSON | `Get-Content packages/client/locale/de.json -Raw \| ConvertFrom-Json` | **ok** (8 Texte geändert, 1 ergänzt) |
| Skripte syntaktisch | `node --check scripts/client-favoriten.mjs` · `node --check scripts/start.mjs` | **exit 0** |
| Profil unberührt | `bun test scripts/tests/profile-patch.test.mjs` | **39 pass · 0 fail** |

---

## 5. Was **nicht** geprüft ist — und warum

| Nicht geprüft | Grund |
|---|---|
| **Der Filter im laufenden Host** | Der Host hat das Bündel beim Start geladen. Die Änderung wirkt erst nach einem Neustart; einen Neustart habe ich nicht ausgelöst, weil er die Sitzung beendet, in der dieser Auftrag läuft. |
| **Der Klick „Nur Favoriten"** | Folge des vorigen Punktes. Nach dem Neustart: Ansichtsoptionen → „Nur Favoriten"; die Liste zeigt dann nur angeheftete Sitzungen, Gruppen ohne Treffer verschwinden. |
| **Sortieren je Arbeitsbereich** | Immer noch offen: die Sortierung gilt für alle Bereiche. Eine eigene Wahl je Bereich bräuchte einen Slot am Gruppenkopf im Kern — oder denselben Ersetzungsweg, dann aber mit einem eigenen Anker-Satz. |

**Rückweg, falls die Änderung stört:** `bun install` stellt das Bündel wieder her; solange der
Aufruf in `scripts/start.mjs` steht, kommt sie beim nächsten Start zurück — der Aufruf ist die eine
Zeile, die man entfernt.
