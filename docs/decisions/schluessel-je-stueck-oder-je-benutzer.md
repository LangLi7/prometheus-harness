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
verpacke(<Schlüssel>, klartext)  ->  { valueCipher, wrappedKey, masterKeyVersion }   DREI Teile
```

Und die Spalten, gemessen in `pmh_test`:

| Tabelle | Umschlag-Spalten |
|---|---|
| `user_secrets` | `value_cipher`, **`wrapped_key`**, **`master_key_version`**, **`key_hint`** — **vier** |
| `chunks` | `content_cipher` — **eine** |

**Wer `chunks.content_cipher` mit dem Ergebnis von `verpacke` füllt, verliert den
Schlüssel.** Das Ergebnis ist **Geheimtext ohne Schlüssel** — aus Sicht der
Wiederherstellung also **Datenverlust**, nicht Verschlüsselung. Es gibt keinen
Typfehler, der das meldet: `bytea` nimmt jeden Byte-Strom.

**Und das ist genau die Art Fehler, die man nur beim Verdrahten findet.** Der
Typlauf hat ihn aufgedeckt (`verpacke` erwartet ein `Uint8Array` und liefert ein
Objekt), die Migration 0006 hätte ihn nie gemeldet.

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
