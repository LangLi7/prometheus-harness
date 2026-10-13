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
| **C4, Stufen 2 und 3** | Docker-Secret und Vault/KMS |
| **POSIX-Zweig der Rechteprüfung** | auf dieser Maschine nicht ausführbar — gehört in die CI |
