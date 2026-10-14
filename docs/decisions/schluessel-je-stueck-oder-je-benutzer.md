# Schlüssel je Stück oder je Benutzer? — die Frage, an der die Kette nicht schließt

> **Stand:** 14.10.2026 · **Anlaß:** Beim Verdrahten des Zerlegers an den Speicher
> (D1) fiel auf, daß der **Umschlag nicht in `chunks` paßt**. Kein Detail — ein
> Entwurfsproblem. Gemessen, nicht vermutet.
>
> **Status:** Entscheidungsvorlage. Bis sie entschieden ist, schließt die Kette
> **nicht**, und das ist besser als eine Kette, die Klartext in der Datenbank
> hinterläßt.

---

## 1. Der Befund

```
export function verpacke(klartext: Uint8Array, haupt: Hauptschluessel): Umschlag
```

**Die Reihenfolge ist `(klartext, haupt)`** — und der Umschlag trägt **vier** Felder:

```
{ valueCipher, wrappedKey, masterKeyVersion, keyHint }
```

**Und ein eigener Fehler, der hierher gehört.** Mein Einleser rief
`verpacke(haupt, bytes)` auf — **vertauscht**. Der Typlauf meldete daraufhin
*„Type 'Hauptschluessel' is missing the following properties from type
'Uint8Array'"* — und ich habe das **falsch gelesen**: ich schrieb in die erste Fassung
dieses Dokuments, `verpacke` erwarte ein `Uint8Array` statt eines Hauptschlüssels.
**Das war falsch.** Die Signatur war die ganze Zeit richtig; mein **Aufruf** war es
nicht. Die Gegenprobe (`Select-String 'export function verpacke'`) hat es aufgedeckt —
**nachdem** das Dokument schon eingecheckt war.

**Der Befund selbst bleibt und wird sogar schärfer.** Gemessen in `pmh_test`:

| Tabelle | Umschlag-Spalten |
|---|---|
| `user_secrets` | `value_cipher`, **`wrapped_key`**, **`master_key_version`**, **`key_hint`** — **vier** |
| `chunks` | `content_cipher` — **eine** |

**Wer `chunks.content_cipher` mit `verpacke(…).valueCipher` füllt, verliert den
Schlüssel.** Das Ergebnis ist **Geheimtext ohne Schlüssel** — aus Sicht der
Wiederherstellung also **Datenverlust**, nicht Verschlüsselung. Es gibt keinen
Typfehler, der das meldet: `bytea` nimmt jeden Byte-Strom.

**Und das ist genau die Art Fehler, die man nur beim Verdrahten findet** — der
Typlauf hat ihn aufgedeckt (wenn auch über einen Umweg: erst durch meinen
vertauschten Aufruf, dann durch das Nachsehen der Signatur). Die Migration 0006
hätte ihn nie gemeldet.

## 2. Die zwei Wege

### (a) Der Umschlag wandert je Stück nach `chunks`

Migration `0008` spiegelt die drei fehlenden Spalten:

```sql
ALTER TABLE chunks
  ADD COLUMN wrapped_key bytea,
  ADD COLUMN master_key_version integer,
  ADD COLUMN key_hint text;
```

**Der Preis, und er ist hoch:** der verpackte Schlüssel ist **je Zeile** ~60–80 Byte.
Ein Vault mit 10 000 Notizen ergibt schnell **Millionen** Stücke — und in **jeder**
Zeile steht **derselbe** Schlüssel, millionenfach verpackt. Das ist nicht nur
Speicher: bei einer Rotation müssen **alle** Zeilen neu geschrieben werden, und die
Rotation ist genau das, wofür die `master_key_version` da ist.

### (b) EIN Datenschlüssel je Benutzer in `user_secrets` — **Empfehlung**

```
user_secrets:  ref = 'rag-datenschluessel'
               value_cipher       <- der Datenschlüssel, verpackt
               wrapped_key        <- vorhanden
               master_key_version <- vorhanden

chunks:        content_cipher      <- NUR der AES-GCM-Geheimtext
```

**Warum das die richtige Richtung ist:** `user_secrets` ist **genau dafür** gebaut —
den Datenschlüssel **einmal** verpacken und für **viele** Werte benutzen. Das ist
der ganze Sinn eines Umschlagverfahrens: der Hauptschlüssel liegt außerhalb, der
Datenschlüssel wird **einmal** verpackt, und die Werte selbst tragen nur ihren
Geheimtext.

**Ein Benutzer hat** einen Vault, einen Wissensspeicher, viele Stücke — und **einen**
Schlüssel je Zweck. Die Umschlag-Spalten sind in `user_secrets` schon da; es braucht
**keine** Migration und **keine** neue Spalte.

## 3. Was die Empfehlung kostet — offen benannt

| Kosten | Warum es trotzdem richtig ist |
|---|---|
| **Rotation trifft alle Stücke eines Benutzers** | das ist bei (a) **genauso**, nur schlimmer: dort müssen zusätzlich alle `wrapped_key` neu geschrieben werden |
| **Ein kompromittierter Datenschlüssel öffnet den ganzen Wissensspeicher eines Benutzers** | das ist die **Folge** der Mandantentrennung, nicht der Schlüsselwahl. Wer einen Benutzer kompromittiert, hat seine Daten ohnehin |
| **Löschen eines Benutzers muß den Datenschlüssel mitnehmen** | `user_secrets` hängt mit `ON DELETE CASCADE` an `users` — gemessen. Die Kaskade nimmt ihn mit |

**Und der Unterschied, der (b) schlägt:** bei (a) liegt der **verpackte** Schlüssel
millionenfach in der Datenbank. Ein angreifender Datenbankleser hat damit millionenfach
dasselbe Ziel — und ein einziger Bruch des Hauptschlüssels öffnet **alles**, in beiden
Fällen. Bei (b) gibt es **ein** zusätzliches Angriffsziel je Benutzer statt eines je
Stück.

## 4. Was nach der Entscheidung zu tun ist

| Schritt | Was |
|---|---|
| 1 | **Entscheidung** (a) oder (b) |
| 2 | Bei (b): eine Funktion `holeDatenschluessel(speicher, haupt, userId)` — legt beim ersten Aufruf einen 32-Byte-Schlüssel an, verpackt ihn über `user_secrets` (`ref = 'rag-datenschluessel'`) und gibt ihn zurück |
| 3 | Der Einleser: `zerlege` → **mit dem Datenschlüssel** `verschluessele` → `legeStueckeAb`. Bei (a) stattdessen `verpacke` je Stück, inklusive der drei Spalten |
| 4 | Eine Prüfung wie die zurückgenommene: **kein Klartext in der Zeile**, Umschlag **wiederherstellbar**, **fremder Schlüssel öffnet nicht**, `embedding IS NULL` und über `offeneStuecke` auffindbar |
| 5 | Die Naht, die bleibt: **der Vektor.** Es gibt keinen Einbettungsdienst (`freellmapi` **401**, `ollama` ohne Host-Port) |

## 5. Warum ich die Entscheidung nicht selbst getroffen habe

Ich habe den Einleser gebaut, den Typlauf gesehen, den Befund gemessen — und die
beiden Dateien **zurückgenommen** (`packages/auth/store-postgres/src/einlesen.ts` und
seine Prüfdatei, **nicht committet**). Nach der Rücknahme: **25 Pakete grün, 0 rot**.

**Warum nicht einfach (b) durchziehen?** Weil es eine Aussage über **Rotation** ist.
Wer den Datenschlüssel je Benutzer legt, legt damit fest: „dreht ein Benutzer seinen
Schlüssel, werden **alle** seine Stücke neu verschlüsselt" — und das ist eine
Betriebsentscheidung, nicht eine Umsetzungsentscheidung.

## 6. Nachfahren

```powershell
cd C:\Users\Chang\prometheus-harness

# Der Befund: vier Umschlag-Spalten gegen eine
docker exec pmh-postgres psql -U pmh_admin -d pmh_test -tAc "SELECT string_agg(column_name, ', ' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='pmh' AND table_name='user_secrets';"
docker exec pmh-postgres psql -U pmh_admin -d pmh_test -tAc "SELECT string_agg(column_name, ', ' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='pmh' AND table_name='chunks';"

# Was `verpacke` liefert — der Typlauf sagt es
bun scripts/typecheck.mjs
Select-String -Path packages/auth/secrets/src/index.ts -Pattern 'export function verpacke' -Context 0,8
```

---

## Nachgemessen am 14.10.2026 — die Effizienzfrage, die den Ausschlag geben sollte

Der Betreiber hat gefragt: *„ich würde nach dem je Benutzer gehen, aber Punkt 2 ist
auch interessant — die Frage ist eher, was ist effizienter, und lohnt sich dieser
Mehraufwand an Schema-Arbeit?"*

Das ist eine **Meßfrage**, und sie ist mit den zwei vorhandenen Operationen direkt
meßbar: `verschluessele(stueck, datenschluessel)` (symmetrisch — der Weg „ein
Schlüssel je Benutzer") gegen `verpacke(stueck, hauptschluessel)` (Umschlag je
Stück: **Schlüsselerzeugung + Wickeln**). Sonde:
`docs/status/messsonden/envelope-cost.mjs` (**exit 0**).

```
Umschlagkosten — 2000 Stuecke je 1200 Byte, gemessen im Prozeß

  A  nur verschluesseln  (ein Schluessel je Benutzer)   9,50 ms gesamt   4,748 µs je Stueck
  B  verpacke je Stueck  (ein Umschlag je Stueck)      15,86 ms gesamt   7,931 µs je Stueck
  C  verpacke EINMAL     (Einmalaufwand von Weg A)      0,075 ms

  Verhaeltnis B/A je Stueck: 1,7x
  Auf 10.000.000 Stuecke:
    Weg A: 47,5 s      Weg B: 79,3 s   (+31,8 s)
```

| Kostenart | ein Schlüssel je Benutzer | Umschlag je Stück |
|---|---|---|
| Schreiben je Stück | **4,75 µs** | **7,93 µs** (1,7×) |
| 10 Mio. Stücke schreiben | 47,5 s | 79,3 s (**+32 s**) |
| Aufschlag je Stück (bytes) | 0 | **100 Byte = 8,3 %** von 1200 |
| Auf 1 Mio. Stücke | 0 | 95,4 MiB |
| Schlüsselwechsel (Master) | **1 Wickeln je Benutzer** | **1 Wickeln je Stück** |
| Löschen eines Stücks | nur per Benutzer | **je Stück** (Krypto-Shredding) |
| Schema-Arbeit | 1 Zeile in `user_secrets` | Schlüsselspalte **je Stück** |

### Der Befund widerlegt meine eigene Erwartung

Ich hatte angenommen, ein Umschlag je Stück sei **um Größenordnungen** teurer.
Gemessen ist er **1,7×** teurer — **+3,2 µs je Stück, über zehn Millionen Stücke
ganze 32 Sekunden.** Die Schlüsselerzeugung ist billig, und AES-GCM über 1200 Byte
dominiert beide Wege. **Der Mehraufwand an Schema-Arbeit läßt sich mit
Schreibleistung also nicht begründen — in keine der beiden Richtungen.**

**Was wirklich entscheidet, ist der Schlüsselwechsel und die Löscheinheit:**

* **Weg B (Umschlag je Stück)** muß beim Masterwechsel **jedes Stück** neu wickeln
  — O(Stücke). Weg A nur **eine Zeile je Benutzer** — O(Benutzer). Bei 10 Mio.
  Stücken ist das der Unterschied zwischen Sekunden und einer Migration, die den
  ganzen Speicher anfaßt.
* **Die Grenze, um die es hier geht, ist der Benutzer** — nicht das Stück. Die
  Forderung des Betreibers lautet *Sicherheit, Sandbox-Gedanke, Speicher-System,
  also der komplette Chat*. Getrennt werden **Benutzer**, nicht Absätze. Ein
  Umschlag je Stück schützt gegen einen Angreifer, der **genau ein Stück** Schlüssel
  erbeutet — für dieses Bedrohungsbild gibt es hier keinen Angreifer.

### Entscheidung (empfohlen und umgesetzt)

**Ein Datenschlüssel je Benutzer**, Referenz `rag-datenschluessel` in
`user_secrets`. **Begründung ausdrücklich nicht „Geschwindigkeit"** — die
Unterschiede sind zu klein, um eine Entscheidung zu tragen —, sondern: die
Löscheinheit ist der Benutzer, der Schlüsselwechsel ist O(Benutzer) statt
O(Stücke), und die Isolationsgrenze des Speichers ist der Mandant.

**Und der Weg zu B bleibt offen.** Das ist keine Einbahnstraße, weil `Umschlag`
bereits `masterKeyVersion` und `keyHint` mitführt: eine spätere Umstellung auf
Umschläge je Stück ist eine **Migration**, kein Umbau. Genau wie vom Betreiber
vorgeschlagen wird die Verschlüsselung hinter einen **Schalter** gelegt (an/aus),
so daß sie erstellt, ungenutzt gelassen und später wieder eingeschaltet werden
kann.

> **Ein eigener Meßfehler, festgehalten.** Der erste Versuch maß die Größe mit
> `JSON.stringify(umschlag).length` und erhielt **4717 Zeichen für 1200 Byte
> Nutzlast — 293 % Aufschlag.** Das war ein **Artefakt der Messung**, kein
> Aufschlag: `JSON.stringify` schreibt ein Byte-Array als **Dezimalzahlen**
> (`[12,34,…]`), jede Zahl kostet ~4 Zeichen. In einer `bytea`-Spalte gilt die
> Byte-Zahl: **100 Byte = 8,3 %**. Wer den JSON-Wert berichtet hätte, hätte einen
> 35-fach zu großen Aufschlag behauptet.
