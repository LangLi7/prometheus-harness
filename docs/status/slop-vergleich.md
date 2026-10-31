# Slop oder nicht — elf Paare

> **Zweck.** Die Vorgaben in [`slop-vorgaben.md`](slop-vorgaben.md) sagen, *was* gilt. Diese
> Datei zeigt, *wie* es aussieht: je ein Paar aus gleicher Aufgabe, einmal als Slop, einmal
> als Arbeit. Die Beleglage steht in
> [`docs/research/ai-slop-code-2026.md`](../research/ai-slop-code-2026.md).
>
> **Die Beispiele sind konstruiert.** Sie zeigen Muster, keine Vorfälle; Zahlen darin sind
> Platzhalter für einen Lauf, den es in Wirklichkeit geben müsste.
>
> **Die eine Unterscheidung.** Nicht die Herkunft entscheidet, sondern die Prüfung. Ein
> Modell darf den Code geschrieben haben — wenn jemand ihn versteht, ihn geprüft hat und das
> sagt. Umgekehrt ist handgeschriebener, ungeprüfter Code Slop.
>
> Stand: 2026-10-28.

---

## 1. Fehler verschlucken

**Slop**

```ts
function loadConfig(raw: string): Config | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
```

**Kein Slop**

```ts
function loadConfig(raw: string): Config {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new InvalidConfig('config is not valid JSON');
  }
  const parsed = configSchema.safeParse(value);
  if (!parsed.success) {
    throw new InvalidConfig(`config is not valid: ${parsed.error.message}`);
  }
  return parsed.data;
}
```

**Der Unterschied.** Der erste Fall macht aus drei Ursachen einen Wert, dem man nicht ansieht,
dass er unbrauchbar ist: kaputtes JSON wird zu `null`, ein falsches Schema rutscht als
`Config` durch, ein fehlendes Feld fällt erst beim Leser auf. Der zweite sagt an der Grenze,
was falsch war.
**Regel:** Vorgabe 4. Der Refactoring-Katalog nennt die Gegenrichtung
[*Replace Error Code with Exception*](https://refactoring.com/catalog/replaceErrorCodeWithException.html).

---

## 2. Warten mit der Uhr

**Slop**

```ts
await new Promise((resolve) => setTimeout(resolve, 500));
// hopefully the client is connected by now
```

**Kein Slop**

```ts
await client.ready; // resolves when the handshake is complete
```

**Der Unterschied.** Die Uhr ist eine Vermutung über eine fremde Maschine. Unter Last ist sie
zu kurz, im Leerlauf zu lang — und der Fehler taucht später an anderer Stelle auf.
**Regel:** Vorgabe 4. Das ist das Muster, das die Forschung als „Race mit `setTimeout`
zudecken" beschreibt.

---

## 3. Typen stumm stellen

**Slop**

```ts
const payload = JSON.parse(body) as any;
return payload.user.id;
```

**Kein Slop**

```ts
const payload = await requestSchema.parseAsync(JSON.parse(body));
return payload.user.id;
```

**Der Unterschied.** `as any` verschiebt den Fehler von der Prüfzeit in die Laufzeit — an
eine Stelle, die weit weg liegt. Der Guard prüft an der Grenze, wo die Daten hereinkommen.
**Regel:** Vorgabe 4. Ein `as any` ist erlaubt, wenn ein Satz daneben steht, warum die
Grenze hier nicht prüfbar ist.

---

## 4. Der Test prüft die Attrappe

**Slop**

```ts
it('saves the user', async () => {
  await saveUser(user);
  expect(repository.save).toHaveBeenCalled();
});
```

**Kein Slop**

```ts
it('saves the user', async () => {
  await saveUser(user);
  expect(await repository.find(user.id)).toEqual(user);
});
```

**Der Unterschied.** Der erste Test ist grün, wenn `saveUser` die Attrappe aufruft — auch
dann, wenn sie nichts speichert. Der zweite prüft die Wirkung.
**Regel:** Vorgabe 2. Ein Test, der nur den Aufruf sieht, kann nicht rot werden, wenn die
Wirkung fehlt.

---

## 5. Den Test an den Fehler anpassen

**Slop**

```ts
it('returns 200 for anonymous users', async () => {
  const response = await request('/api/me');
  expect(response.status).toBe(200); // was 401, changed to pass
});
```

**Kein Slop**

```ts
it('returns 401 for anonymous users', async () => {
  const response = await request('/api/me');
  expect(response.status).toBe(401);
});
```

**Der Unterschied.** Der erste Fall hat den Fehler in die Erwartung übernommen. Die Prüfung
bestätigt jetzt das falsche Verhalten — und der Kommentar sagt es sogar.
**Regel:** Vorgabe 2. Wenn ein Test rot wird, ist die erste Frage „welcher von beiden lügt?",
nicht „wie bekomme ich ihn grün?".

---

## 6. Kopie mit einer Änderung

**Slop**

```ts
function priceForCustomer(item: Item) { /* 40 lines */ }
function priceForPartner(item: Item) { /* the same 40 lines, one constant changed */ }
```

**Kein Slop**

```ts
function priceFor(item: Item, tier: 'customer' | 'partner'): Money {
  const rate = tier === 'customer' ? CUSTOMER_RATE : PARTNER_RATE;
  // one implementation
}
```

**Der Unterschied.** Die Kopie ist heute billig und in drei Monaten teuer: Jede Korrektur
muss an zwei Stellen passieren, und eine wird vergessen. **Regel:** Vorgabe 4 — Wiederverwendung
ist Teil der Lesbarkeit. Gegenprobe: Wenn sich die beiden Fälle *getrennt* entwickeln sollen,
ist die Duplikation richtig — dann aber mit einem Satz Begründung.

---

## 7. Toter Code „für später"

**Slop**

```ts
// keep for later, might be useful
// function syncLegacyUsers() { ... 60 lines ... }
```

**Kein Slop**

```ts
// deleted: syncLegacyUsers() was unused since the 2025 migration.
// The history is in git; the reason is in the commit message.
```

**Der Unterschied.** „Für später" heißt fast immer „nie" — und bis dahin liest jeder den
Code mit und fragt sich, ob er noch läuft. **Regel:** Vorgabe 1. Der Katalog nennt das
[*Remove Dead Code*](https://refactoring.com/catalog/removeDeadCode.html).

---

## 8. Der Pull Request

**Slop**

```
fix stuff

- 1.200 lines
- no test
- "also cleaned up a few things"
```

**Kein Slop**

```
fix: reject anonymous requests on /api/me

The route checked the session but not the CSRF token, so a
cross-site request could read the profile. The test was red
before the fix and is green after it.

Tested: bun test packages/api/auth-http (14 pass, 0 fail)
Not tested: the browser flow (no browser on this machine)
Generated with assistance; reviewed line by line.
```

**Der Unterschied.** Der zweite Fall beantwortet die Fragen, die ein Reviewer sonst stellen
muss: warum, was geprüft, was nicht. Der erste verschiebt sie.
**Regel:** Vorgaben 1, 3 und 7.

---

## 9. Die Dokumentation

**Slop**

```
## loadConfig
Lädt die Konfiguration. Gibt die Konfiguration oder null zurück.
```

**Kein Slop**

```
## loadConfig
Wirft `InvalidConfig`, wenn die Datei kein gültiges JSON ist oder ein Feld fehlt.
Der Aufrufer muss den Fehler behandeln; es gibt keinen stillen Rückfall auf Vorgaben.
Gemessen: 14 Prüfungen in `config.test.ts`, Stand 2026-10-28.
```

**Der Unterschied.** Der erste Text wiederholt die Signatur. Der zweite sagt, was der
Aufrufer wissen muss: welcher Fehler, welche Pflicht, welcher Beleg.
**Regel:** Vorgabe 9. Eine Zahl ohne Datum und Lauf ist eine Behauptung.

---

## 10. Die neue Abhängigkeit

**Slop**

```
npm install is-even
```

**Kein Slop**

```ts
const isEven = (value: number): boolean => value % 2 === 0;
```

**Der Unterschied.** Ein Paket für eine Zeile ist ein dauerhafter Vertrauensvorschuss an
einen Fremden — mit Update-Pflicht, Lizenz und Angriffsfläche. **Regel:** Vorgabe 6.
Wenn ein Paket nötig ist: Name exakt geprüft, Quelle genannt, Fassung gepinnt, Zweck im
Commit.

---

## 11. Die verschachtelte Bedingung

**Slop**

```ts
function canPublish(doc: Doc, user: User): boolean {
  if (doc) {
    if (user) {
      if (user.isAdmin || doc.ownerId === user.id) {
        if (doc.status !== 'archived') {
          return true;
        }
      }
    }
  }
  return false;
}
```

**Kein Slop**

```ts
function canPublish(doc: Doc | null, user: User | null): boolean {
  if (!doc || !user) return false;
  if (doc.status === 'archived') return false;
  return user.isAdmin || doc.ownerId === user.id;
}
```

**Der Unterschied.** Der erste Fall baut vier Ebenen für eine Regel, die drei Zeilen hat: Die
Fehlerfälle stehen innen, statt außen. Der zweite liest sich als Regel — erst die Ausnahmen,
dann der Normalfall. **Regel:** Vorgabe 4. Der Katalog nennt das
[*Replace Nested Conditional with Guard Clauses*](https://refactoring.com/catalog/replaceNestedConditionalWithGuardClauses.html).

---

## Grenzfälle: Wo dieselbe Form kein Slop ist

Die Paare oben sind keine Verbote von Formen. Sie sind Verbote von **ungeprüfter
Weiterreichung**. Fünf Fälle, in denen dasselbe aussieht und etwas anderes ist:

| Fall | Warum kein Slop | Bedingung |
|---|---|---|
| Der Wegwerf-Entwurf (Spike) | er soll eine Frage beantworten, nicht getragen werden | als Wegwerf markiert, nicht gemergt, danach gelöscht |
| Die Test-Fixture | harte Werte sind dort der Zweck | sie beschreibt einen Fall, nicht die Wirklichkeit |
| Die erzeugte Datei | ein Befehl hat sie erzeugt, nicht ein Autor | Befehl und Fassung sind festgehalten, Ausgabe reproduzierbar |
| Der kopierte Baustein | er wird einmal gelesen und dann verantwortet | jemand hat ihn verstanden, nicht nur eingefügt |
| Die bewusste Duplikation | zwei Dinge, die sich getrennt ändern sollen | ein Satz Begründung steht dabei |

**Der gefährlichste Fall ist der Prototyp, der produktiv wird.** Er war kein Slop, solange
er eine Frage beantwortete. Er wird Slop in dem Moment, in dem er ohne Neuschreiben in den
Betrieb geht — weil niemand mehr die Prüfung nachholt, die er nie hatte.

---

## Die drei Fragen, die den Unterschied machen

Sie gelten für Menschen und für Modelle, für neuen und für alten Code:

1. **Kann ich es erklären, ohne den Code zu öffnen?**
   Wer die Absicht nicht in einem Satz sagen kann, hat sie nicht.
2. **Würde ich das reviewen wollen, wenn es von jemand anderem käme?**
   Die Frage prüft die Größe und die Lesbarkeit in einem Zug.
3. **Was passiert, wenn es falsch ist — und wer merkt es?**
   Die Frage prüft, ob die Prüfung existiert oder nur behauptet wird.

Drei Mal „ja": kein Slop, unabhängig davon, wer es geschrieben hat.
Ein „nein": nicht fertig — oder Slop.

---

## Was die Forschung dazu sagt

- **Die Herkunft ist kein Kriterium.** Willison hat den Begriff für *aufgedrängte,
  ungeprüfte* Inhalte geprägt, nicht für KI-Inhalte an sich. Die curl-Episode zeigt beide
  Seiten: erst Slop-Meldungen, später gute, KI-gestützte Meldungen — die Qualität stieg, die
  Last blieb.
- **Die Eigenschaften sind messbar beschreibbar.** Oberflächliche Kompetenz,
  Aufwandsasymmetrie, Massenproduzierbarkeit (Kommers et al.). Die Paare oben sind
  Alltagsformen dieser drei Eigenschaften.
- **Der Schaden entsteht beim Prüfer.** Deshalb ist „sieht gut aus" das gefährlichste
  Urteil: Es ist genau die Eigenschaft, die Slop von schlechtem Code unterscheidet.
- **Die Gegenprobe ist der Test.** Wo eine Prüfung rot werden kann, ist die Frage „Slop oder
  nicht" schon beantwortet — nicht durch ein Urteil, sondern durch einen Lauf.

---

## Quellen

- [`docs/research/ai-slop-code-2026.md`](../research/ai-slop-code-2026.md) — Beleglage,
  Zahlen und Grenzen.
- [Refactoring-Katalog](https://refactoring.com/catalog/) — *Remove Dead Code*, *Extract
  Function*, *Replace Error Code with Exception*, *Replace Nested Conditional with Guard
  Clauses*.
- [Willison 2024](https://simonwillison.net/2024/May/8/slop/) — die ursprüngliche Fassung
  des Begriffs.
- Kommers et al. 2026, *Why slop matters*, ACM AI Letters — die drei Eigenschaften.
