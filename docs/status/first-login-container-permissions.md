# First Login, Maschinen-Claim und container-artige Rechte — Nachweis

> **Auftrag:** t41. **Weisung:** *„beim first login sollte der claim ect über den rechner
> selbst wo es läuft bestätigt werden … Permission sollte wie ein container system behandelt
> werden … der harness & agent spiegelt der befugnisse vom User Permission selbst."*
>
> **Konzept:** [`docs/decisions/first-login-container-permissions.md`](../decisions/first-login-container-permissions.md)

## Was gebaut ist — und was nur entschieden

| Teil | Stand | Beleg |
|---|---|---|
| **Konzeptdokument** | **fertig**, in `docs/INDEX.md` eingetragen | §3 oben, `INDEX.md` Abschnitt 3 |
| **Rechteprüfung** `darfAusfuehren` | **gebaut und geprüft** | `packages/auth/permissions/src/index.ts`, **30 Prüfungen** grün |
| **Maschinen-Claim** (Erstlogin) | **gebaut und geprüft** | `packages/auth/claim/src/index.ts`, **21 Prüfungen** grün |
| **Migration 0004** (`user_profiles`) | **nicht gebaut** — im Konzept §3 entworfen | offen |
| **Admin-Schnittstelle** (Benutzer anlegen/ändern) | **nicht gebaut** — die Rechteprüfung entscheidet bereits darüber | offen |
| **Verdrahtung in den Host** | **nicht gebaut** | offen |
| **RLS + zusammengesetzte Fremdschlüssel** (B-S1) | **nicht gebaut** | Befund B-S1 |

**Ehrlich benannt:** gebaut ist der **Kern** — die Entscheidung, wer was darf, und der
Erstlogin. **Nicht** gebaut ist die Verdrahtung: heute entscheidet niemand mit dieser Prüfung,
weil der Host sie nicht aufruft. Die Prüfung ist die Voraussetzung, nicht das Ergebnis.

## Belege

```
bun run scripts/typecheck.mjs                         ->  20 Pakete grün, 0 rot
bun test packages/auth/permissions packages/auth/claim ->  51 pass, 0 fail (2 Dateien)
bun test                                               ->  945 pass, 1 fail (34 Dateien)
bun run scripts/quelltext-pruefung.mjs                 ->  404 Dateien, keine Treffer
```

Der **eine** Fehlschlag der Gesamtsuite ist `apps/cli/tests/flags.test.ts` (der
typert-loader registriert sechs Contributoren nicht). Er **scheitert allein** und gehört zum
Werk des anderen Agenten, nicht zu diesem Auftrag — nachgeprüft mit
`bun test apps/cli` → `0 pass, 1 fail`.

## Was die Prüfungen tatsächlich beweisen

**Die Spiegelung der Befugnisse (der Kern der Weisung).** Ein Agent, der im Auftrag eines
normalen Benutzers läuft, darf **nicht** in das Home eines anderen schreiben — **auch dann
nicht, wenn der Harness selbst als Admin läuft**. Das ist als benannte Prüfung hinterlegt
(`EIN ADMIN-AGENT IM AUFTRAG EINES BENUTZERS HAT NUR DESSEN RECHTE`). Die Umkehrung ist
ebenso geprüft: der Agent darf **nicht weniger** — sonst wäre das System unbrauchbar und die
Regel würde umgangen.

**Der Amok-Schutz.** Sechs Admin-Aktionen × ein normaler Benutzer = sechsmal abgewiesen, jede
mit Regel und Grund. Und: eine Admin-Aktion **aus dem Harness heraus** wird **auch dem Admin**
verweigert, wenn keine unterschriebene Freigabe vorliegt (Regel `freigabe-fehlt`). Der Satz
dahinter: *„der Harness ist der Harness" ist keine Befugnis.*

**Die Freigabe ist nicht fälschbar.** Geprüft: gefälschte Unterschrift abgewiesen, abgelaufene
abgewiesen, **Freigabe für eine andere Aktion** abgewiesen, und ohne Prüfschlüssel wird
**abgewiesen statt geraten** (fail-closed).

**Die Pfadprüfung gegen die zwei klassischen Umgehungen.** `..`-Wanderung
(`/home/u1/../../etc/passwd`) und das Geschwisterverzeichnis mit passendem Präfix
(`/home/u1-boese` gegen Wurzel `/home/u1`) — beide abgewiesen.

**Der Claim bindet an den Rechner, nicht an eine Behauptung.** Nachgestellt und abgewiesen:
gleicher Hostname und gleicher Nutzername auf einem **anderen Dateisystem** — **das Kopieren
der Claim-Datei genügt nicht**. Dazu: Einmaligkeit, Ablauf, und die Regel, daß mit **einem**
Benutzer kein neuer Claim mehr entsteht.

## Zwei eigene Fehler, die die Prüfungen gefunden haben

1. **Unterschreiben und Prüfen bauten den Text an zwei Stellen zusammen** — fünf Felder gegen
   vier, dazu ein Schreibfehler. Jede Freigabe wäre **ungültig** gewesen, und zwar **still**.
   Behoben, indem es jetzt **eine** Funktion `freigabeText` gibt. Der Fehler ist der Grund,
   warum dieser Teil im Code so aussieht, wie er aussieht.
2. **Die Prüfung „mit gültiger Freigabe erlaubt" ließ den Prüfschlüssel weg** und wurde rot.
   Das war ein Fehler **in der Prüfung**, nicht im Code — und er hat den Schutz nebenbei
   belegt: ohne Schlüssel wird abgewiesen, nicht geraten.

## Grenzen, die dazugehören

* **Eine Pfadprüfung in reiner Logik sieht keine symbolischen Verweise.** Ein Pfad, der formal
  innerhalb einer Wurzel liegt, kann über einen Symlink nach außen zeigen. Diese Prüfung ist
  die **erste** Schicht; die Durchsetzung gehört in den Kernel (`landlock`) bzw.
  `services/pmh-sandbox`. Wer sich allein auf den Textvergleich verläßt, baut eine Attrappe.
  Das steht auch im Dateikopf von `packages/auth/permissions/src/index.ts`.
* **„Wie ein VPS" gilt prozessual, nicht materiell.** Alle Benutzer teilen Kernel,
  Prozeßbaum und Datenbank. Ohne eigenen Prozeß je Benutzer (Weisung: *„nie ein gemeinsamer
  Harness-Prozess für mehrere User"*) ist die Grenze eine Absicht.
* **Die Datenbank erzwingt noch nichts** (B-S1). Die Isolation ist bis dahin
  Anwendungssache.
* **Ressourcengrenzen sind nicht gemessen.** Das Konzept nennt Rechenzeit und Speicher; ob
  `pmh-sandbox` sie durchsetzt, ist **nicht geprüft** und bleibt offen.
