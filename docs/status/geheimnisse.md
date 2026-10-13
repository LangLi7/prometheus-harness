# Geheimnisse — C1 und der erste Schritt von C4

**Stand:** 13.10.2026 · **Neues Paket:** `packages/auth/secrets` · **Prüfungen:** 29

Dieses Blatt belegt eine Aussage: **es gibt jetzt eine Umschlagverschlüsselung, und der
Hauptschlüssel kann aus einer Datei kommen statt aus der Umgebung.** Jede Zahl nennt den
Befehl, der sie gemessen hat.

---

## 1. Was fehlte

Gemessen, vor dem Bau:

```
grep -r "createCipheriv|aes-256-gcm|wrapped_key|value_cipher"  →  nur Schema-Treffer
```

Das Umschlagverfahren existierte **als Schema** seit Migration 0001 — `value_cipher`,
`wrapped_key`, `master_key_version`, `key_hint` — und **kein Stück Code** hat es benutzt. Und
`PMH_MASTER_KEY` wurde von **keinem** Code gelesen (nur von `scripts/install-teile.mjs`
**geschrieben**).

**Die Form war schon vorgeschrieben.** Migration 0002 sagt wörtlich:

> *`content_cipher` trägt version (1 Byte) || nonce (12 Byte) || ciphertext || tag (16 Byte)
> aus AES-256-GCM.*

Diese Bytes sind das Ziel, nicht mein Entwurf.

---

## 2. Was gebaut ist

| Datei | Was |
|---|---|
| `packages/auth/secrets/src/krypto.ts` | AES-256-GCM in der Form des Schemas, Fassungsnummer vorne, geprüfte Schlüssellänge |
| `packages/auth/secrets/src/schluesselgeber.ts` | Woher der Hauptschlüssel kommt: Datei → Umgebungsvariable |
| `packages/auth/secrets/src/index.ts` | Der Umschlag: `verpacke`, `entpacke`, `rotiere`, `fingerabdruck` |
| `scripts/schluessel.mjs` | Den Hauptschlüssel erzeugen und nach `<PMH_HOME>/master.key` schreiben |

**Keine eigene Kryptographie.** `createCipheriv`/`createDecipheriv`/`randomBytes` kommen aus
`node:crypto`. Wer AES selbst schreibt, schreibt es falsch.

---

## 3. Die Eigenschaften, die geprüft sind — nicht „es läuft"

| Behauptung | Prüfung | Ergebnis |
|---|---|---|
| das Byteformat ist das des Schemas | `1 + 12 + n + 16` | **grün** |
| eine Veränderung wird **erkannt** statt Unsinn zu liefern | Bit im Geheimtext **und** im Anhang umgedreht | **Fehler**, kein Müll |
| ein falscher Schlüssel scheitert | fremder Schlüssel | **Fehler** |
| die Fassung wird **vor** dem Entschlüsseln erkannt | Fassung auf 99 gesetzt | `falsche-fassung` |
| ein wiederverwendeter Nonce kommt nicht vor | zweimal derselbe Klartext | **zwei verschiedene** Geheimtexte |
| **kein stilles AES-128** | 16-Byte-Schlüssel | `falsche-schluessellaenge` |
| **die Rotation läßt den Geheimtext byte-gleich** | `rotiere` | `valueCipher` **identisch** |
| die falsche Fassung ist nicht „falscher Schlüssel" | Umschlag v1, Schlüssel v2 | eigene Meldung |
| `key_hint` verrät das Geheimnis nicht | 8 Hexzeichen, Klartext nicht enthalten | grün |
| die Datei **gewinnt** gegen die Umgebungsvariable | beide gesetzt | Herkunft = Datei |
| eine **kaputte** Datei führt NICHT zur Umgebungsvariable | Datei mit „zu-kurz" | **Fehler**, kein Durchreichen |

`bun test packages/auth/secrets/tests/krypto.test.ts` → **29 pass / 0 fail**, Exit **0**.

**Warum die Rotation byte-gleich bleibt, ist der ganze Grund für die zweite Stufe.** Ohne sie
müßte man bei jeder Rotation jedes Geheimnis entschlüsseln und neu verschlüsseln — und dabei
läge jeder Klartext im Speicher, statt nur der 32-Byte-Datenschlüssel.

---

## 4. Der gemessene Befund, der den Rechteprüfstand bestimmt

**Auf NTFS meldet `fs.Stats.mode` immer `0o666`** — unter Bun gemessen:

```
writeFileSync(p, 'x', { mode: 0o600 })  ->  statSync(p).mode & 0o777 === 0o666
chmodSync(p, 0o600)                     ->  statSync(p).mode & 0o777 === 0o666
```

**Was daraus folgt — und was ich NICHT getan habe.** Eine strenge Prüfung „die Schlüsseldatei
muß 0600 sein" würde auf diesem Rechner **immer** scheitern; die Stufe wäre unbenutzbar. Eine
stille Prüfung, die immer durchgeht, wäre **schlimmer**: sie sieht aus wie ein Schutz und ist
keiner. Deshalb:

* **POSIX:** eine gruppen- oder weltlesbare Schlüsseldatei ist ein **Fehler**.
* **Windows:** es wird **gesagt**, daß die Prüfung nicht möglich ist, und benannt, was die
  Datei wirklich schützt (das Benutzerprofil). Der Hinweis erscheint beim Anlegen des
  Schlüssels.

**Der POSIX-Zweig ist auf dieser Maschine nicht ausführbar** (`platform()` ist `win32`). Die
Prüfung behauptet deshalb auf **beiden** Plattformen etwas — hier den Hinweis, dort den Fehler
— statt auf einer still durchzulaufen. Der erste Entwurf lief auf POSIX still durch; das war
genau das Muster, das ich anderen ankreide.

---

## 5. Der Hauptschlüssel: Datei statt Umgebungsvariable (C4, erste Stufe)

Die Reihenfolge hat der Auftrag vorgegeben: **Datei 0600 → Docker-Secret → Vault/KMS.**

| Stufe | Stand |
|---|---|
| **Datei** (`<PMH_HOME>/master.key`, 0600) | **gebaut** — `scripts/schluessel.mjs` |
| Docker-Secret | offen — technisch eine Datei an anderem Ort, also Stufe 1 mit anderem Pfad |
| Vault/KMS | offen — braucht einen Dienst |
| Umgebungsvariable | **Übergang**, bleibt als letzter Rückfall |

**Warum die Umgebungsvariable bleibt.** Sie sofort nicht mehr zu lesen hieße: die bestehende
Installation verliert ihren Hauptschlüssel, und **jede bereits verschlüsselte Zeile wäre nicht
mehr zu öffnen**. Die erste Stufe, die gefunden wird, gewinnt — also die Datei, sobald es sie
gibt.

**Warum die Umgebungsvariable weg soll.** Sie ist für jeden Prozeß desselben Benutzers lesbar
und landet in Fehlerberichten und Container-Inspektionen.

**Ende-zu-Ende gemessen** (Wegwerf-Home):

```
scripts/schluessel.mjs            -> Exit 0, Datei angelegt, 43 Zeichen base64url = 32 Byte
scripts/schluessel.mjs (nochmal)  -> Exit 1, verweigert (ein neuer Schlüssel machte
                                     jede verschlüsselte Zeile unlesbar)
holeHauptschluessel(...)          -> Herkunft: "Datei …\master.key"
verpacke/entpacke                 -> Klartext zurück: true, value_cipher 49 Byte
                                     (= 1 + 12 + 20 + 16, geprüft)
```

**Das Skript zeigt den Schlüssel nicht an.** Er steht in der Datei; eine Ausgabe landet im
Verlauf und in Protokollen.

---

## 6. Ein eigener Meßfehler

Meine erste Exit-Code-Messung des Skripts ergab **0 für beide Aufrufe** — auch für den, der
sich weigern soll. Ursache: `… | Select-String …` setzt `$LASTEXITCODE` auf das **letzte Glied
der Pipeline**, nicht auf Bun. Nachgemessen ohne Pipeline: **erster Aufruf 0, zweiter 1**. Die
Prüfung war falsch, nicht das Skript.

---

## 7. Prüfstand

| Prüfung | Ergebnis |
|---|---|
| Krypto-Prüfungen (neu) | **29 pass / 0 fail**, 55 Zusicherungen, Exit **0** |
| Typsystem | **23 Pakete grün** (vorher 22), Exit **0** |
| Gesamtsuite auf `pmh_test` | **1080 pass / 2 fail** — 1082 in **40** Dateien |
| Auflösung des Paketnamens | `@prometheus-harness/secrets`, 19 Ausfuhren |
| `scripts/schluessel.mjs` | erster Aufruf **Exit 0**, zweiter **Exit 1** |

Die Zahl stieg von **1051 auf 1080** grün — **+29**, genau die neuen Prüfungen. Diesmal geht
die Rechnung auf; die unerklärte Differenz aus Runde 9 (B3) bleibt dort als offener Punkt
stehen.

Die 2 roten sind **nicht unsere**: `apps/cli` (`typert-loader`) und
`packages/util/atomic-write` (`Zugriff verweigert`, os error 5).

---

## 8. Was offen ist

| Was | Warum |
|---|---|
| **C1 ist halb** | Die Kryptographie steht, aber **kein Code liest oder schreibt `user_secrets`**. Es fehlen `speichereGeheimnis`/`ladeGeheimnis` im Speicher und ein Weg, über den der Bediener einen Anbieterschlüssel setzt. Die Tabelle hat also noch **keinen Aufrufer** — dasselbe Muster, das wir an `claim` und `permissions` beklagt haben |
| **C2** | Passwort-Reset über `one_time_tokens` — die Tabelle ist da, kein Code benutzt sie |
| **C3** | API-Schlüssel-Erzeuger mit ≥112 Bit Entropie und Pepper |
| **C4, Stufe 3** | Vault/KMS — die Stufe ist im Typ vorgesehen (`Schluesselart` kennt `'vault'`), es gibt aber **keine** Quelle dafür |
| **POSIX-Zweig der Rechteprüfung** | auf dieser Maschine nicht ausführbar — gehört in die CI |

---

## 9. Nachtrag 13.10.2026 — C4, **zweite Stufe**: das Docker-Secret

**C1, C2 und C3 sind inzwischen geschlossen** (`geheimnisse-ablage.md`,
`passwort-reset.md`, `api-schluessel.md`) — die Tabelle in §8 ist insoweit
überholt und bleibt als Verlauf stehen (Hausregel H6: kennzeichnen, nicht löschen).

### Was dazugekommen ist

| Datei | Was |
|---|---|
| `packages/auth/secrets/src/schluesselgeber.ts` | `DOCKER_SECRET_PFAD`, `dockerSecretQuelle(pfad, warnung)` |
| `packages/auth/secrets/src/index.ts` | `standardQuellen(umgebung, home, dockerPfad?, warnung?)` — **die Leiter an einer Stelle** |
| `scripts/geheimnis.mjs`, `scripts/apischluessel.mjs` | benutzen die Leiter statt einer eigenen Kopie |
| `packages/auth/secrets/tests/schluesselkette.test.ts` | **8** Prüfungen |

### Der Entwurf stand schon da — bis auf eine Einzelheit

Die Leiter in `src/index.ts` sagte zu Stufe 2: *„ist eine Datei an einem anderen
Ort, die Stufe 1 mit anderem Pfad"*. Das ist **fast** richtig, und der Unterschied
ist der Grund für eine eigene Funktion:

**Docker hängt Secrets mit Modus `0444` ein** — für Gruppe und Andere lesbar. Die
Rechteprüfung aus `dateiQuelle` würde auf POSIX also **werfen**, und die ganze
Stufe wäre **unbenutzbar**: sie stünde in der Leiter und könnte nie greifen. Eine
Stufe, die immer scheitert, ist schlimmer als keine — sie sieht aus wie eine
Möglichkeit und ist keine.

**Warum das Weglassen dort richtig ist.** Der Schutz eines Docker-Secrets ist nicht
der Dateimodus, sondern die **Grenze des Containers**: `/run/secrets` ist ein
`tmpfs`, sichtbar nur innerhalb des Containers. **Und es wird gesagt** — genau wie
auf NTFS: die Quelle meldet, daß sie den Modus nicht prüft, und warum. Ein stilles
Überspringen wäre ein Schutz, der nur so aussieht. Geprüft: der Hinweis kommt
**einmal**, nicht bei jedem Zugriff (eine Meldung, die immer kommt, wird nicht
gelesen).

### Die Reihenfolge ist eine Sicherheitsaussage

| Stufe | Wo | Wie gut |
|---|---|---|
| 1 | `master.key` im Home (0600) | die beste verfügbare: außerhalb der Datenbank, aus dem Baum heraus |
| 2 | Docker-Secret `/run/secrets/pmh_master_key` | gleichwertig, anderer Ort — für den Containerbetrieb |
| 3 | `PMH_MASTER_KEY` in der Umgebung | die **schwächste**: Umgebungen landen in `docker inspect`, in Protokollen, in Fehlerberichten. Sie bleibt **zuletzt** |

**Warum die Leiter jetzt an *einer* Stelle steht.** Die Kette
`[dateiQuelle(…), umgebungsQuelle(…)]` stand **zweimal** im Baum — und mit der
Docker-Stufe wäre sie **dreimal** dagestanden. Drei Kopien einer Reihenfolge sind
drei Gelegenheiten, sie verschieden zu ändern; dann liest ein Skript den Schlüssel
aus der Datei und das andere aus der Umgebung, und **beide sehen richtig aus**.

### Gemessen

| Prüfung | Ergebnis |
|---|---|
| Reihenfolge der Stufen | `['datei','docker-secret','umgebung']` ✓ |
| die **Datei** gewinnt gegen die Umgebungsvariable | ✓ — und es ist wirklich der Schlüssel **aus der Datei** |
| das **Docker-Secret** gewinnt gegen die Umgebungsvariable | ✓ |
| ohne Datei und Secret greift die Umgebungsvariable | ✓ — **keine** Verdrängung des Bestehenden |
| ein **kaputtes** Secret fällt **nicht** durch | ✓ — es wirft |
| `dockerSecretQuelle().art` ist `'docker-secret'`, nicht `'datei'` | ✓ |
| der Vorgabepfad `/run/secrets/…` existiert hier **nicht** | ✓ — die Stufe ist auf dieser Maschine **inert**, und das steht so da |
| Hinweis einmal, nicht je Zugriff | ✓ |
| Typprüfung | **25 Pakete grün, 0 rot** |
| Voller Lauf | **1182 pass, 2 fail** in 48 Dateien — Zuwachs **+8**, genau die neuen Prüfungen |

### Was **nicht** getan ist — und warum

* **`docker-compose.yml` ist nicht angefaßt.** Dort gehörte ein `secrets:`-Block
  mit `pmh_master_key` hin. Diese Datei liegt in der Wurzel, an der **ein anderer
  Agent** arbeitet (`native/flock/`, `services/pmh-*`, Wurzeldateien) — eine
  gleichzeitige Änderung wäre ein Konflikt ohne Gewinn. Die Stufe ist **im Code
  fertig und geprüft**; es fehlt der Eintrag im Stapel, nicht die Fähigkeit.
* **Kein Laufzeit-Aufrufer.** `standardQuellen` wird von den **Skripten** benutzt
  (`geheimnis.mjs`, `apischluessel.mjs`) — der laufende Host liest den
  Hauptschlüssel **nirgends**. Solange nichts verschlüsselt wird, gibt es nichts zu
  entschlüsseln. Das ist kein Mangel dieser Stufe, sondern der nächste Schritt
  (Verschlüsselung im Betrieb).
* **Stufe 3 (Vault/KMS) fehlt.** `Schluesselart` kennt `'vault'` seit dem ersten
  Tag; eine Quelle dafür gibt es nicht.
