# Sitzungsprotokolle — Klartext unter einer Wurzel, ohne Eigentümer

> **Gemessen:** 14.10.2026 · Sonde
> [`messsonden/protokoll-offenlegung.mjs`](messsonden/protokoll-offenlegung.mjs) · Exit **0**

## 1. Der Befund

```
37 Protokolle · 871 951 B komprimiert → 2 966 352 B entpackt
211 Nachrichten · 249 926 Zeichen Text
Eigentumsfelder: KEINE        Benutzerverzeichnisse: 0
```

**Die Datenbank ist nicht die einzige Grenze.** Die Mandantentrennung ist auf der
Datenbankseite abgeschlossen und gemessen: zusammengesetzte Fremdschlüssel
(Migration 0004), RLS-Verhalten belegt ([mandantentrennung.md](mandantentrennung.md) §13),
und seit dem 14.10.2026 gibt es den **Aufrufer** `mitMandant`, der den Mandanten
transaktionslokal setzt.

**Die Sitzungsprotokolle liegen daneben und werden davon nicht erfaßt.**

## 2. Was gemessen ist — und wie

| Frage | Meßweg | Ergebnis |
|---|---|---|
| Ist der Inhalt **ohne Schlüssel** lesbar? | entpacken mit `Bun.zstdDecompressSync` — **kein** Geheimnis übergeben | **ja.** zstd ist Kompression, keine Verschlüsselung |
| Trägt ein Protokoll seinen **Eigentümer**? | Felder des `session`-Ereignisses | **nein:** `type, version, id, createdAt, cwd, parentSession, isSeeded, origin, delegationDepth, agentPreset` |
| Liegen alle Sitzungen unter **einer** Wurzel? | Verzeichnisse auflisten | **ja** — 2 Projektverzeichnisse, **0** Benutzerverzeichnisse |
| Wie viele Benutzer kennt der Host? | `docker exec pmh-postgres psql -U pmh_admin -d pmh -tAc "select count(*) from pmh.users;"` | **3** Benutzer, **0** Administratoren |

**Zwei Sätze, die zusammengehören.** Wer Zugriff auf das Harness-Home hat, liest **jede**
Sitzung. Und: aus dem Protokoll selbst läßt sich **keine** Trennung ableiten — es gibt kein
Feld, nach dem man filtern könnte. Eine Sicht, die „nur meine Sitzungen" zeigen soll, hat
nichts, woran sie sich halten kann.

## 3. Ein zweiter Riß in derselben Wurzel

Die beiden Projektverzeichnisse sind:

```
--C-Users-Chang-prometheus-harness--
--D-Windows-Dokumente-deepseek-harness-default-workspace--
```

Die zweite gehört **nicht** zu diesem Projekt. Sitzungen aus einem **fremden
Arbeitsbereich** liegen in **unserem** Home. Die Wurzel ist also nicht nur über Benutzer
geteilt, sondern auch über **Projekte**.

## 4. Die Wege — benannt, mit ihrem Preis, **ohne Entscheidung**

| Weg | Was er verlangt | Preis |
|---|---|---|
| **a) Eine Wurzel je Benutzer** | die Ablage hat `root` als **Pflichtangabe ohne Vorgabewert** — ein eigener Pfad je Benutzer ist also **konfigurierbar** | unser Host ist **ein** Prozeß mit **einem** Home. Mehrere Benutzer bräuchten **einen Host je Benutzer** oder ein Umhängen je Sitzung. Das ist eine **Verdrahtungsentscheidung**, kein Schalter |
| **b) Verschlüsselung der Ablage** | die Ablage bietet **keine**. Unser `packages/auth/secrets` hat `verpacke`/`entpacke` (Umschlagverfahren, gemessen) | der **Kern** schreibt die Datei. Ohne einen Haken dort müßten wir hinterher verschlüsseln — ein zweiter Schreiber am selben Bestand |
| **c) Dateisystemrechte** | ein Home je Betriebssystembenutzer | hilft **nicht** gegen mehrere Benutzer **in** einem Host — und der Host bedient mehrere |
| **d) Protokolle nicht behalten** | `root` auf ein flüchtiges Verzeichnis | kostet den Verlauf, den `session/page` und die Suche brauchen |

**Nichts davon ist gebaut. Nichts davon ist entschieden.** Dieser Abschnitt nennt die Wege
und ihre Preise; welcher gilt, hängt an der Frage, **ob ein Host mehrere Benutzer bedienen
soll**. Solange das offen ist, wäre jede Wahl geraten.

## 5. Was ausdrücklich **nicht** behauptet wird

* **Nicht**, daß dies ein Defekt ist. Die Ablage tut, was ihre Beschreibung sagt; sie ist
  für **einen** Benutzer gedacht und so gebaut. Der Riß entsteht erst durch die
  **Mehrbenutzer-Anmeldung**, die wir daneben betreiben.
* **Nicht**, daß RLS hier hilft. Es hilft **nicht**: es filtert Zeilen in PostgreSQL, nicht
  Dateien auf der Platte.
* **Nicht**, daß die Inhalte kompromittiert sind. Gemessen ist die **Zugänglichkeit**,
  nicht ein Zugriff.

## 6. Reproduktion

```powershell
bun docs/status/messsonden/protokoll-offenlegung.mjs
docker exec pmh-postgres psql -U pmh_admin -d pmh -tAc "select count(*) from pmh.users;"
```

Die Sonde gibt **keine Inhalte** aus — nur Anzahl, Länge und Struktur. Ein Nachweis über
Offenlegung, der die offengelegten Inhalte abdruckt, ist selbst eine Offenlegung.
