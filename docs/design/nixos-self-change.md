# NixOS-Selbständerung — Konzept und Schnittstelle

> **Was dieses Dokument ist:** das Konzept für eine Selbständerung des Systems als gestufter,
> umkehrbarer Vorgang — und die Schnittstelle, über die sie später ausgeführt wird. Es
> beschreibt **Absicht und Vertrag**, nicht eine Installation.
>
> **Grundlage:** [`../decisions/hybrid-then-self-build.md`](../decisions/hybrid-then-self-build.md)
> §3.1 (das Arbeitspaket samt der verbindlichen Abgrenzung), [`../project-profile.md`](../project-profile.md)
> §4 (NewDawn0 als NixOS-Vorbild), [`../concept.md`](../concept.md) Regel 4 („Sprachgrenzen
> sind Dienstgrenzen"), [`../stack.md`](../stack.md).
>
> **Umsetzung:** [`../../services/pmh-nix/`](../../services/pmh-nix/README.md).
>
> Stand: 12.10.2026.

---

## 1. Das Ziel

Der Harness soll sich selbst ändern können: nicht nur seinen Code, sondern auch die
Systemumgebung, in der er läuft. Ein Agent, der eine Abhängigkeit braucht, soll sie
**deklarieren** können — und der Weg von der Deklaration zur wirksamen Änderung soll ein
Vorgang sein, der sichtbar, prüfbar und umkehrbar ist.

Was dabei entsteht, ist keine Fernwartung und kein Skript, das als root Zeilen an eine
Konfiguration hängt. Es ist eine **Transaktion**.

## 2. Warum NixOS das richtige Fundament ist

Die Begründung stammt nicht von uns, sondern aus einer Messung der Vorbilder. Sie steht in
[`../project-profile.md`](../project-profile.md) §4:

> **NewDawn0 — Systemaufbau und NixOS-Vorbild.** Geprüft am 12.10.2026 über alle drei Seiten
> seiner Repositories. Sein Profil: „Just a guy who likes Linux and coding". Sprachen: Nix,
> Rust, Go, Lua, C/C++, Haskell, Zig, Shell.
>
> | Repo | Sprache | Warum für uns interessant |
> |---|---|---|
> | `sys-cfg`, `nixConfig` | Nix | Systemkonfiguration als Code, Generationen, Umschalten |
>
> **Die Verbindung zu unserem Projekt** ist damit nicht die Oberfläche, sondern der
> **NixOS-Ansatz**, den der Betreiber von Anfang an genannt hat: Einheiten deklarieren,
> Generationen, atomares Umschalten und Zurückrollen, ein Wrapper als gemeinsame Basis.

Vier Eigenschaften machen NixOS für diesen Zweck geeignet, und keine davon ist Geschmack:

| Eigenschaft | Was sie bedeutet | Warum sie hier trägt |
|---|---|---|
| **Konfiguration als Code** | Die Systembeschreibung ist deklarativer Text in einem Flake, nicht eine Folge von Befehlen | Die Änderung ist **lesbar, bevor** sie wirkt. Genau das braucht eine Prüfschicht: einen Diff, über den man entscheiden kann |
| **Generationen** | Jeder Wechsel erzeugt eine neue Generation, die vorige bleibt liegen | Eine Änderung ist kein Endzustand, sondern ein **Schritt** mit Vorgänger |
| **Atomares Umschalten** | Der Wechsel gilt ganz oder gar nicht | Es gibt keinen halb angewandten Zustand, über den niemand mehr Auskunft geben kann |
| **Rückweg** | Zurückrollen ist das Umschalten auf die vorige Generation | Der Ausweg ist so billig wie der Weg hinein — das ist die Bedingung dafür, dass man ihn überhaupt gehen darf |

**Der entscheidende Punkt:** Ein System, das sich selbst ändern kann, ist nur dann
vertretbar, wenn jede Änderung atomar ist und zurückgerollt werden kann. Ohne diese beiden
Eigenschaften wäre Selbständerung eine Wette. Mit ihnen ist sie eine Transaktion.

## 3. Die Grenze — verbindlich: NixOS und Nix werden nicht installiert

> ### ⚠ Abgrenzung
>
> **Weisung des Betreibers vom 12.10.2026: „kein nixos installieren lol".**
>
> Der Anlass ist eine Messung, kein Vorbehalt: `nix` und `nixos-rebuild` sind auf diesem
> Rechner **nicht vorhanden** (Windows). Diese Feststellung ist der **Ist-Zustand**, kein
> Installationsauftrag ([§3.1](../decisions/hybrid-then-self-build.md) sagt das ausdrücklich:
> *„Die Umgebungsmessung dient damit nur der Feststellung des Ist-Zustands, nicht als
> Installationsauftrag."*).
>
> | Erlaubt | **Nicht** erlaubt |
> |---|---|
> | Das **Konzept** beschreiben: Module, Flakes, Generationen, Rollback | NixOS oder Nix auf diesem Rechner **installieren** |
> | Die **Schnittstelle** definieren: Actuation-API, Verträge, Fehlercodes | Eine Distribution austauschen, partitionieren, booten |
> | Den Dienst `pmh-nix` als **Gerüst** bauen, mit **Backend-Austausch** | Die Actuation gegen ein echtes System **ausführen** |
> | Eine **Attrappe** als Backend, damit alles testbar ist | `nixos-rebuild switch` irgendwo auslösen |
>
> Kein WSL-Subsystem wird eingerichtet, kein Paketmanager aufgerufen, keine
> Betriebssystem-Einstellung verändert.

### 3.1 Was stattdessen gebaut wird

Drei Dinge, und nur diese drei:

1. **Das Konzept** — dieses Dokument: der Vorgang, seine Stufen, seine Fehlersemantik.
2. **Die austauschbare Schnittstelle** — ein Interface mit sieben Methoden
   (`internal/actuation`), hinter dem die Ausführung liegt. Konzept und Schnittstelle ändern
   sich nicht, wenn später eine echte Ausführung dazukommt; es kommt eine **weitere
   Implementierung** hinzu.
3. **Zwei Backends**:
   - `stub` — die **Vorgabe**. Eine ehrliche Attrappe: sie meldet
     `available: false` mit dem Grund *„nicht verfügbar: kein Nix auf diesem Wirt"*, ruft kein
     Programm auf und führt den vollen Vertrag auf **eigener Buchführung**. Jede so entstandene
     Generation trägt `system: "attrappe"` und den Vermerk *„nichts am System geändert, nur
     Buchführung"*.
   - `nix` — ein **vorhandenes, aber inertes** Backend. Es ruft `nix`/`nixos-rebuild` auf.
     Fehlt `nix` auf dem Suchpfad, **scheitert jeder Aufruf laut** (fail-closed, Exit-Code
     125). Es gibt keinen Weg, auf dem dieses Backend stillschweigend Erfolg meldet, ohne
     etwas getan zu haben — insbesondere liefert `Apply` niemals eine erfundene Generation.

**Der Nutzen dieser Aufteilung:** Die Vision ist geplant, ohne dass heute etwas installiert
oder umgestellt wird. Und der Vertrag ist **heute schon messbar** — 45 Tests, davon sieben
allein zur Sicherheitsinvariante.

## 4. Der Transaktionsvertrag

```text
propose ──▶ check ──▶ policy ──▶ apply ──▶ Generation ──▶ rollback
  ▲                                                              │
  └──────────────── der Rückweg ist ein Umschalten ──────────────┘
```

| Stufe | Was geschieht | Wer entscheidet | Fehlersemantik |
|---|---|---|---|
| **propose** | Der Dienst erzeugt aus einer Anfrage den **textuellen Diff**, den die Änderung bewirken würde, vergibt die Kennung und zeichnet beides auf | offen — Vorschlagen ist nicht gesperrt | Kein Flake-Pfad: Aufruffeher (2). Backend kann nicht: Backendfehler (125). **Es entsteht keine Wirkung, nur ein Datensatz.** |
| **check** | Statische Prüfung des Diffs. Die Befunde tragen Schwere (`info`, `warning`, `error`) und Text; das **Ergebnis wird aufgezeichnet** | offen — Prüfen ist nicht gesperrt | Ein Befund der Schwere `error` sperrt: Politikfehler (1). Die Aufzeichnung ist ab hier die Grundlage jeder weiteren Entscheidung. |
| **policy** | Eigenständige Schicht, die über die Zulässigkeit der Anwendung entscheidet. Sie liest **ausschließlich die Aufzeichnung**, kein Feld der Anfrage | **die Politik** | Jede Ablehnung nennt einen maschinenlesbaren Grund: `vorschlag-unbekannt`, `vorschlag-schon-angewandt`, `vorschlag-ungeprueft`, `pruefung-gesperrt`, `diff-geaendert`. Politikfehler (1). |
| **apply** | Führt den Diff aus und liefert die entstandene Generation. Das Backend prüft **zusätzlich selbst** und verweigert, wenn seine Prüfung sperrt | das Backend, aber nur nach der Politik | Backend kann nicht: Backendfehler (125), **ohne** Generation. Der Vorschlag bleibt unangewandt. |
| **Generation** | Die neue Generation ist die aktive; die vorige bleibt liegen | — | Es gibt genau eine aktive Generation. Ein Vorschlag wirkt genau **einmal**; ein zweites `apply` wird abgewiesen. |
| **rollback** | Umschalten auf eine vorhandene Generation | offen — der Rückweg ist bewusst nicht gesperrt | Unbekannte Generation: Politikfehler (1). Es wird **nichts wiederhergestellt**, sondern umgeschaltet. |

**Zwei Eigenschaften, die den Vertrag tragen:**

- Die Reihenfolge ist bindend. `policy.Require(apply)` steht **vor** jedem `Backend.Apply`.
  Ein Backend wird nie ohne Zulassung angefasst.
- Die Zulassung kommt **nie** aus der Anfrage. Es gibt in `api.Proposal` absichtlich kein
  `checked`, kein `safe`, kein `policy_ok`, kein `approved_by`. Ein von Hand in die Ablage
  geschriebenes `"checked": true` ist wirkungslos, weil die Politik auf die **Aufzeichnung**
  schaut und nicht auf den Vorschlag.

## 5. Warum das Selbständerung vertretbar macht

Drei Sätze, die den Unterschied ausmachen:

**1. Der Agent ändert Code, nicht Zustand.** Ein Vorschlag ist ein Text-Diff gegen eine
deklarative Beschreibung. Er beschreibt eine Absicht, er trägt keine Befehlsfolge. Wer den
Diff liest, weiß, was geschehen würde — **bevor** es geschieht. Deshalb ist die Prüfstufe
überhaupt möglich: Es gibt etwas zu prüfen.

**2. `nixos-rebuild` ist der Transaktionsrand.** Innerhalb des Randes mag viel geschehen;
nach außen gibt es **einen** Übergang — ganz oder gar nicht. Der Harness muss also nicht
wissen, wie ein Systemwechsel im Einzelnen funktioniert; er muss nur wissen, wo der Rand
liegt und wie man ihn zweimal betritt.

**3. Rollback ist ein Umschalten, keine Wiederherstellung.** Es gibt kein Zurückspielen einer
Sicherung, keine Rekonstruktion, keine Frage, ob das Backup vollständig war. Die vorige
Generation liegt noch da; der Rückweg zeigt auf sie. Der Ausweg ist damit so billig wie der
Weg hinein — und nur deshalb darf man diesen Weg überhaupt gehen.

Zusammen: Die Änderung ist **lesbar** (1), **ganz oder gar nicht** (2) und **umkehrbar** (3).
Fehlt eine der drei, ist die Selbständerung eine Wette.

## 6. Die Sicherheitsregel und ihre geprüften Invarianten

> **Das Modell empfiehlt, die Policy entscheidet — ein Modell löst niemals einen
> Systemwechsel aus.**
>
> Ein Modell — oder jeder andere äußere Aufrufer — kann genau **eines**: einen Vorschlag
> aufnehmen. Was daraus wird, entscheidet die Politik.

Diese Regel ist keine Beschreibung, sondern eine **erzwungene und getestete Eigenschaft**.
Die Namen der Tests sagen die Invariante:

| Invariante | Test | Was gemessen wird |
|---|---|---|
| Ohne Prüfung keine Anwendung | `TestApplyRejectsUncheckedProposal` | `apply` auf einen nur vorgeschlagenen Datensatz wird abgewiesen; nach `check` geht es |
| Keine Umgehung über Vorschlagsfelder | `TestPolicyCannotBeBypassedByProposalFields` | ein Vorschlag, der sich selbst für geprüft, sicher, genehmigt und anwendbar erklärt, wird trotzdem abgewiesen — die Politik liest nur die Aufzeichnung |
| Nur eigene Kennungen | `TestApplyRejectsUnknownProposal` | nur eine von `propose` vergebene Kennung kommt durch |
| Einmal wirkt | `TestApplyRejectsAlreadyAppliedProposal` | ein Vorschlag erzeugt genau eine Generation |
| Sperrende Befunde sperren | `TestApplyRefusesWhenCheckFoundErrorSeverityFinding` | ein Befund der Schwere `error` verhindert die Anwendung |
| Gebundene Bytes | `TestPolicyRejectsTamperedDiff` | wer den Diff nach der Prüfung tauscht, fällt über den Fingerabdruck durch |
| Nur `apply` ist gesperrt | `TestProposeIsTheOnlyOpenAction` | Vorschlagen, Prüfen und der Rückweg bleiben offen |
| Fail-closed ohne Werkzeugkasten | `TestNixRefusesEveryMutatingCallFailClosed` | ohne `nix` scheitert jeder Aufruf des echten Backends laut — und `Apply` liefert keine Generation |

Der Rückweg ist **absichtlich offen**. Ein System, aus dem man nicht herauskommt, wäre
schlimmer als eines, das sich ändert.

**Ehrliche Einschränkung.** Auf diesem Wirt gibt es kein Nix. In der Vorgabe-Betriebsart
läuft der Vertrag der Attrappe deshalb **durch**: er erzeugt einen Datensatz, der wie eine
Generation aussieht — und der ausdrücklich als Attrappe gekennzeichnet ist. Wer „eine
Generation ist entstanden" mit „das System wurde umgestellt" gleichsetzt, liest die Ausgabe
falsch. Der Unterschied ist an jedem Datensatz ablesbar: `system: "attrappe"` und der Vermerk
in `note`. Die Betriebsart **streng** der Attrappe zeigt die andere Seite: sobald sie sich für
unverfügbar erklärt, verweigert sie jede Anwendung.

## 7. Offene Fragen — Messungen, keine Aufträge

Diese Fragen sind **offen**. Keine von ihnen wird hier entschieden, und **keine** ist ein
Auftrag, etwas zu installieren.

| Offene Frage | Warum sie offen ist | Was sie klären würde |
|---|---|---|
| **Wo läuft die Actuation später?** Drei Ränder sind denkbar: ein eigener **NixOS-Host**, ein **Container** oder ein **WSL2-Rand**. | Die Umgebungsmessung (§3.1) hat alle drei Optionen als *vorhanden* festgestellt (WSL2 mit Distributionen; Docker mit laufendem Daemon), aber keine als *geeignet* gemessen. | Eine Messung, kein Beschluss: Welcher Rand lässt sich am billigsten zurückrollen, und welcher lässt sich am ehrlichsten überwachen? |
| **Wie wird der Diff berechnet?** | Ohne Werkzeugkasten gibt es keinen ehrlichen Diff. `nixos-rebuild build --dry-run` ist der geplante Weg, aber ungemessen. | Ein Vergleich: Wie vollständig ist die Ausgabe eines Trockenlaufs gegenüber einem echten `nix store diff-closures`? |
| **Wer darf einen Vorschlag einreichen?** | Heute ist der Rand die Prozessgrenze, nicht ein Benutzer. Es gibt keine Signaturprüfung und keine Authentisierung. | Ein Modell für Herkunft und Prüfsumme — nicht nur für die Änderung, sondern für den **Einreicher**. |
| **Wie wird die Generationenliste ausgelesen?** | Geplant ist `nix-env --list-generations --profile /nix/var/nix/profiles/system`. | Eine Messung, ob die Liste stabil genug ist, um darauf Entscheidungen zu stützen. |
| **Was geschieht bei einem Rückweg über einen Neustart hinweg?** | Ein Rückweg ist ein Umschalten. Ob der nächste Start dieselbe Generation sieht, ist Teil des Randes und nicht gemessen. | Eine Messung auf dem gewählten Rand. |

**Keine dieser Fragen rechtfertigt heute eine Installation.** Sie werden beantwortet, wenn ein
Rand gewählt und gemessen ist — und der Dienst ändert sich dafür nicht: es kommt eine weitere
Implementierung von `internal/actuation` hinzu.
