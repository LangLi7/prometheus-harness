# API-Schlüssel: 256 Bit Zufall, ein abgeleiteter Pfeffer — und in der Tabelle nur der HMAC

> **Stand:** 13.10.2026 · **Paket:** C3 · **Status:** Erzeuger, Ablage und Aufrufer
> belegt — **kein Verbraucher im Anfrageweg**, siehe §7
>
> **Die Weisung:** *„Erzeuger mit erzwungener Entropie (≥ 112 Bit) und Pfeffer."*
>
> **Vorher:** Die Tabelle `api_keys` steht seit Migration **0001** im Schema — mit
> Form, Nebenbedingungen, zwei Indizes und der Begründung. Sie hatte **keinen
> Schreiber**. `grep` über den ganzen Baum fand sie nur in der Migration und in
> einem Übersichtsdokument.

---

## 1. Was gebaut wurde

| Datei | Was darin steht |
|---|---|
| `packages/auth/apikey/src/index.ts` | Erzeugen, Zerlegen, Pfeffer ableiten, Prüfen — **20** Prüfungen in `tests/apikey.test.ts` |
| `packages/auth/store-postgres/src/index.ts` | `erzeugeApiKeyAblage`, `widerrufeApiSchluessel`, `listeApiSchluessel` |
| `scripts/apischluessel.mjs` | **Der Aufrufer**: `anlegen`, `liste`, `widerrufen`, `pruefe` |
| `scripts/apischluessel.test.mjs` | **13** Prüfungen, die den Aufrufer gegen echtes PostgreSQL fahren |

---

## 2. Die Form war schon vorgeschrieben — samt Begründung

Migration 0001, wörtlich:

```sql
-- Ausgegebenes Format: pmh_<key_id>_<secret>
--   key_id 12 Zeichen base64url - der Suchschluessel
--   secret 32 zufaellige Bytes base64url - das Geheimnis
-- Der Hash wird ueber das GANZE Token gebildet, nicht nur ueber das Geheimnis:
-- so ist auch die Kennung faelschungssicher.
```

Dieses Paket **folgt** dem, es weicht nicht ab. Was der `CHECK` verlangt, wird
eingehalten und geprüft: `key_id` **genau zwölf** Zeichen, `token_hash` **genau 64**
Hexzeichen, und `expires_at > created_at` — ein Schlüssel ohne Ende wird nie
rotiert, deshalb ist die Geltungsdauer **Pflicht** und wird nicht durchgereicht.

**Erzeugt werden 32 Byte = 256 Bit.** Verlangt waren mindestens 112 Bit (NIST
SP 800-57, Sicherheitsniveau für Schlüssel bis 2030). Die Sperre steht als
Selbstprüfung **beim Laden** des Moduls: wer `GEHEIMNIS_BYTES` später senkt,
bekommt einen Abbruch und keine Fußnote.

### Der Fund, der beinahe durchgerutscht wäre: `split('_')` ist mehrdeutig

`base64url` enthält `_` **und** `-`. Eine Kennung darf also selbst einen
Unterstrich enthalten. Gemessen über **10 000** erzeugte Schlüssel:

| | Anzahl | Anteil |
|---|---|---|
| Kennung enthält `_` | **1657** | **16,57 %** |
| Kennung **beginnt** mit `_` | **155** | **1,55 %** |
| `token.split('_')[1]` ergibt die **falsche** Kennung | **1657** | 16,57 % |
| `zerlegeToken` ergibt die falsche Kennung | **0** | 0 % |

Eindeutig ist das Format **nur** mit festen Längen. Beginnt die Kennung mit `_`,
liefert `split('_')[1]` den **leeren** Text. Gefunden hat das eine Prüfung, die
daran **selten** scheiterte — in rund 1,55 % der Läufe, mit `Exit 1` statt `0`
(„braucht eine key_id"). Das ist die unangenehmste Sorte Fehler: einer, der fast
immer grün ist. Der Zerleger trägt die Zahlen jetzt in seiner Beschreibung.

---

## 3. Der Pfeffer — und was er wirklich leistet

Ein Sitzungstoken wird mit **SHA-256** gehasht. Hier steht ein **HMAC-SHA256** mit
einem Pfeffer, der **nicht** in der Datenbank liegt:

| Wer | Was er kann |
|---|---|
| nur die Datenbank | ein vorgelegtes Token **nicht prüfen** — ohne Pfeffer ist der HMAC nicht nachzurechnen |
| Datenbank **und** Hauptschlüssel | prüfen (und damit raten) |

**Und die ehrliche Grenze:** gegen das Erraten hilft der Pfeffer hier **nicht** —
32 Zufallsbytes sind ohnehin nicht zu raten. Sein Wert ist ein anderer: er trennt
die beiden Geheimnisse. Wer die Datenbank abzieht, hat **nicht** schon alles zum
Prüfen. Gegen ein schwaches Geheimnis schützt er nicht, und das muß er auch nicht:
**dieses Paket erzeugt die Schlüssel selbst**, also gibt es kein schwaches.

**Wie er entsteht.** Nicht der Hauptschlüssel selbst, sondern
`HMAC-SHA256(Hauptschlüssel, 'pmh-api-schluessel-pfeffer')` — ein Ein-Schritt-
HKDF-Expand. Denselben Schlüssel für zwei Zwecke zu benutzen (Verschlüsselung und
Schlüsselprüfung) ist genau das, was man nicht tut. Geprüft: *„der Pfeffer IST
NICHT der Hauptschlüssel"*.

**Die Folge, offen benannt:** ein **Hauptschlüsselwechsel macht alle API-Schlüssel
ungültig**. Der alte Pfeffer ist dann nirgends mehr. Das ist der Preis dafür, daß
er nicht in der Datenbank liegt — ein eigener Pfefferspeicher mit eigener Fassung
bräuchte eine Spalte, und die gibt es nicht.

### Der Beweis, daß der Pfeffer gebraucht wird — am echten Server

Derselbe Schlüssel, dieselbe Datenbank, derselbe Eintrag, **nur ein anderer
Hauptschlüssel** in der Umgebung:

```
(pass) DER PFEFFER WIRD WIRKLICH GEBRAUCHT: anderer Hauptschlüssel → abgewiesen
```

Wäre der Eintrag ein blanker SHA-256, ginge diese Prüfung durch. Dazu die scharfe
Gegenprobe auf der Zeile: `token_hash` **entspricht** dem HMAC mit dem richtigen
Hauptschlüssel und **widerspricht** dem bloßen `sha256(token)` — beides sind 64
Hexzeichen, von außen nicht zu unterscheiden, nur nachzurechnen.

---

## 4. Drei Vorkehrungen, die man nicht sieht

1. **Die Form zuerst.** Ein 10 000 Zeichen langes „Token" löst **keinen**
   Datenbankzugriff aus. Geprüft, indem die Attrappe ihre Suchen **zählt**:
   `expect(a.suchungen).toHaveLength(0)`.
2. **Der HMAC wird immer gerechnet** — auch bei unbekannter Kennung. Wer die
   Antwortzeit mißt, soll nicht erfahren, ob eine Kennung existiert.
3. **Der Vergleich in gleichbleibender Zeit** (`timingSafeEqual`). `===` bricht
   beim ersten abweichenden Zeichen ab; über viele Versuche verrät die Laufzeit,
   wie viele führende Zeichen stimmen.

Und: **jede** Abweisung trägt denselben Satz (`SCHLUESSEL_ABWEISUNG`), während die
**Regel** (`unbekannt`, `abgelaufen`, `widerrufen`, `falsch`, `form`) intern
unterscheidbar bleibt. Ohne das verriete „widerrufen", daß es den Schlüssel einmal
gab. Geprüft über vier Fälle in einer Prüfung, samt der Zusicherung, daß die
Regeln **wirklich verschieden** sind — sonst wäre der Test leer.

---

## 5. Die Ablage: zwei Entscheidungen

| Frage | Entscheidung | Warum |
|---|---|---|
| Wer vergibt die `id`? | die **Tabelle** (`gen_random_uuid()`) | der Primärschlüssel ist die Sache der Datenbank; wer ihn von außen mitgibt, kann ihn doppelt vergeben. Bei den Einmal-Token ist es **umgekehrt** — dort braucht der Aufrufer die Kennung, weil `verbrauche` sie als Bedingung führt |
| Wie wird gesucht? | über **`key_id`** | ein HMAC läßt sich nicht indizieren, ohne ihn zu berechnen. Das Schema hat dafür einen eigenen Index (`api_keys_live_idx … WHERE revoked_at IS NULL`). Die Kennung ist **kein** Geheimnis — sie dient dem Finden; das Geheimnis beweist |

**`widerrufeApiSchluessel` ist wiederholbar und ändert beim zweiten Aufruf
nichts** — die Bedingung `revoked_at IS NULL` sorgt dafür, daß der **erste**
Widerruf gewinnt. Sonst könnte ein zweiter Aufruf die Begründung verwischen, und
die Begründung ist das, was nach einem Vorfall zählt. Geprüft über die Zeile:
zweiter Widerruf trifft nichts (`Exit 2`), `revoked_reason` bleibt stehen.

**`listeApiSchluessel` gibt keinen Hash aus.** Ein Hash in einer Bildschirmausgabe
ist ein Geheimnis an der Stelle, an der es nichts zu suchen hat. Geprüft:
`expect(text).not.toMatch(/[0-9a-f]{64}/u)`.

---

## 6. Eigene Fehler auf dem Weg

| Fehler | Wie er auffiel |
|---|---|
| `$1, $3, $4` bei **drei** übergebenen Werten (`widerrufeApiSchluessel`) | beim Schreiben gesehen und korrigiert — die Parameternummern waren gesprungen |
| **Drei** Typprüfungs-Regressionen durch `exactOptionalPropertyTypes` | `benutztAm: undefined` ist nicht erlaubt. Kein Formalismus: „nie benutzt" und „Feld fehlt" sind zwei Aussagen — die Felder werden jetzt nur gesetzt, wenn es sie gibt |
| eine Zusicherung auf einen **Satz, den es nicht gibt** (`'besteht aus einem einzigen Satz'`) | die Prüfung war rot; ich hatte den Text erfunden statt nachgesehen |
| `--name` wurde **gespeichert, aber nicht angezeigt** | die Prüfung war rot. Ein Name, den der Bediener nicht sieht, hilft beim Unterscheiden nicht — und dafür ist er da |
| `split('_')[1]` in der Prüfung statt `zerlegeToken` | **der interessante**: siehe §2. Selten rot (1,55 %), und zwar mit einem irreführenden Fehlerbild |
| `expect(x).not.toBeNull()` — **auch für `undefined` grün** | beim Nachrechnen gesehen: hätte die Suche die Zeile nicht gefunden, wäre die Prüfung trotzdem durchgegangen. Jetzt `toBeInstanceOf(Date)` **und** `toHaveLength(1)` |

---

## 7. Was **nicht** belegt ist — und was fehlt

| Offen | Warum es offen ist |
|---|---|
| **Nichts im Anfrageweg prüft einen API-Schlüssel.** `pruefeApiSchluessel` hat einen Aufrufer — das Skript —, aber **kein** HTTP-Weg nimmt einen Schlüssel an | ein Schlüssel, den man nicht benutzen kann, ist noch kein Zugang. Die vier bestehenden Wege (`register`, `login`, `logout`, `me`) kennen nur das Sitzungscookie |
| **Keine Durchsetzung der Umfänge** | `scopes` wird gespeichert und zurückgegeben, aber **keine** Stelle entscheidet danach, was erlaubt ist. Gespeichert ist nicht durchgesetzt |
| Kein Endpunkt zum Anlegen und Widerrufen | die Skripte bedienen den Betreiber; ein Selbstbedienungsweg für Benutzer fehlt |
| Kein Ratenbegrenzer auf `pruefe` | das Skript ist lokal; sobald ein HTTP-Weg Schlüssel annimmt, braucht **er** eine Grenze |
| Der Hauptschlüsselwechsel | siehe §3 — die Folge ist benannt, aber nicht abgefangen (keine Warnung im Protokoll) |

---

## 8. Nachfahren

```powershell
$map = @{}; foreach ($l in (Get-Content .env)) { if ($l -match '^\s*([A-Za-z_]\w*)\s*=') { $k,$v = $l -split '=',2; $map[$k.Trim()] = $v.Trim() } }
$env:DATABASE_URL = $map['DATABASE_URL']
$env:PMH_TEST_DATABASE_URL = $map['MIGRATION_DATABASE_URL'] -replace '/pmh(\?|$)','/pmh_test$1'
$BUN = 'C:\Users\Chang\.bun\bin\bun.exe'

# die Regeln, ohne Infrastruktur — 20 pass, 0 fail
& $BUN test packages/auth/apikey/tests/apikey.test.ts
# der Aufrufer gegen echtes PostgreSQL — 13 pass, 0 fail
& $BUN test scripts/apischluessel.test.mjs

# von Hand
& $BUN scripts/apischluessel.mjs anlegen --benutzer <email> --name "Mein Schlüssel"
& $BUN scripts/apischluessel.mjs liste --benutzer <email>
& $BUN scripts/apischluessel.mjs pruefe <token>
& $BUN scripts/apischluessel.mjs widerrufen <key_id> --grund "Rechner verloren"
```

Die Prüfungen der Skripte übergeben die Umgebung als **Parameter** (`fuehreAus(argv,
umgebung, schreibe, lese)`), lesen also **nicht** `process.env`. Die
Betriebsdatenbank wird von ihnen nicht einmal gesehen. Der Hauptschlüssel in der
Prüfung ist ein **eigener** (`'11'.repeat(32)`), nie der des Betreibers.

---

## 9. Zahlen

| Messung | Wert |
|---|---|
| Typprüfung | **25 Pakete grün, 0 rot** — 2.9 s (vorher 24; `packages/auth/apikey` ist neu) |
| Voller Lauf | **1152 pass, 2 fail** in **45** Dateien — 13.35 s |
| Zuwachs gegenüber dem Stand davor (1119) | **+33** = 20 (Regeln) + 13 (Aufrufer) — **genau** |
| Die zwei roten | `apps/cli/tests/flags.test.ts` (typert-loader) und `packages/util/atomic-write` (`os error 5`, `TEMP`) — **beide nicht unsere**, unverändert seit dem vorigen Lauf |
| Neue Prüfungen in diesem Schritt | **33** |
| Prüfungen des Pakets `apikey` | 20 (74 Zusicherungen) |
| Prüfungen des Aufrufers | 13 (59 Zusicherungen) |
