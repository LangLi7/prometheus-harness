# Erster Login, Maschinen-Claim und container-artige Rechte

> **Weisung des Betreibers, wörtlich:** *„beim first login sollte der claim ect über den
> rechner selbst wo es läuft bestätigt werden und danach user, login ect erstellt werden bzw
> muss. also ein Admin Konto später kann der admin konto auch weiter user logins erstellen für
> die anmeldung und Permission sollte wie ein container system behandelt werden also user
> bekommt sozusagen ihre eigene Container umgebung verstehst du was ich meine? wie ein VPS.
> der admin hat den komplette zugriff, der harness & agent spiegelt der befugnisse vom User
> Permission selbst. somit läuft der agent harness nicht amok mit anfrage eine normale user und
> Harness selbst zb mit admin permission"*
>
> **Was diese Datei entscheidet.** Den Ablauf des ersten Logins, die Anlage des Admiralkontos,
> die Benutzerverwaltung, das Isolationsprofil je Benutzer und — der wichtigste Punkt — die
> **Spiegelung der Befugnisse**: der Agent handelt **immer** mit den Rechten des fragenden
> Benutzers, nie mit mehr.

---

## 1. Der Bestand — was es schon gibt (gemessen)

| Baustein | Stand | Ort |
|---|---|---|
| **Rollen im Schema** | **vorhanden**: `role text NOT NULL DEFAULT 'user'` mit `CHECK (role IN ('user','admin'))` | `migrations/0001_identitaet.sql:30,35` |
| **Rolle im Typ** | **vorhanden**: `readonly role: 'user' \| 'admin'`, `CreateOptions.role`, `role: options.role ?? 'user'` | `packages/auth/auth/src/identity.ts:48,291,409` |
| **Rollen-DURCHSETZUNG** | **fehlt vollständig** — die Rolle wird gespeichert und nirgends geprüft | 0 Treffer für eine Prüffunktion |
| **Isolationsprofil** | **vorhanden als Typ**: `SandboxPolicy { file_access, read_roots, write_roots, network, spawn }` mit `Enforcement::{Full,Partial,Unusable}` und `validate()` gegen widersprüchliche Profile | `services/pmh-sandbox/src/lib.rs:60–134` |
| **Werkzeugberechtigungen** | **ausdrücklich nicht vorhanden**: *„Mehr nicht: keine Berechtigungen, keine Wiederholung, keine Nebenläufigkeit"* | `packages/core/agent-tools/src/index.ts:6` |
| **Nachweis der Durchsetzbarkeit** | **vorhanden**: `native/landlock-run` (Linux) und `pmh-sandbox` melden ehrlich, was sie **nicht** durchsetzen konnten | `native/landlock-run`, `Enforcement::Unusable` |
| **Maschinen-Claim / Erstinbetriebnahme** | **fehlt vollständig** | 0 Treffer für `claim`, `provision` |
| **Mandantentrennung in der Datenbank** | **fehlt** — die DB erzwingt keine Eigentümerbindung, RLS auf allen elf Tabellen aus | Befund **B-S1**, `docs/review/sicherheits-befunde.md` |

**Der wichtigste Satz aus dieser Sichtung:** das Schema hat die Rolle, `pmh-sandbox` hat das
Profil, `landlock-run` kann es durchsetzen — **verbunden ist nichts davon.** Es fehlt nicht die
Mechanik, es fehlt die **Verknüpfung** von Benutzer → Profil → Durchsetzung.

## 2. Der Maschinen-Claim — wer darf das erste Konto anlegen

**Das Problem.** Ein frisch installiertes System hat **keine** Benutzer. Wer das erste Konto
anlegt, ist der Eigentümer. Ohne Regel wäre das jeder, der den Port erreicht — der klassische
Fehler ist ein voreingestelltes Kennwort wie `admin/admin`.

**Die Antwort: der Claim bindet an den Rechner.** Wer lokalen Zugang hat, darf das erste Konto
anlegen. Das ist keine Willkür, sondern die **ehrliche Vertrauenswurzel**: wer eine Shell auf
diesem Rechner hat, könnte ohnehin alles lesen und ändern. Ein Claim über das Netz wäre
*schwächer* als die Wirklichkeit — er würde eine Grenze behaupten, die es nicht gibt.

**Der Ablauf.**

```
1. Start ohne Benutzer  ->  das Harness erzeugt einen EINMAL-Claim
    - 32 Zufallsbytes (crypto.getRandomValues)  ->  Klartext nur EINMAL sichtbar
    - gespeichert wird NUR der SHA-256-Hash, in `one_time_tokens`
      mit purpose = 'erster-admin' und expires_at = jetzt + 15 Minuten
    - Bindeglied des Claims (alle drei, alle geprüft):
        hostname        os.hostname()
        lokaler Nutzer  os.userInfo().username
        Geraetekennung  32 Zufallsbytes in <home>/geraet, Rechte 0600, einmal erzeugt
2. Ausgegeben wird er auf ZWEI Wegen, damit ein Weg ausfallen darf:
    - in die Konsole (der Startbildschirm druckt ihn)
    - in die Datei <home>/claim.txt mit Rechten 0600
    Kein Versand per E-Mail, kein Netzdienst — beides wären neue Angriffsflächen.
3. Der Eigentuemer ruft den Claim ein: Name, E-Mail, Kennwort, Claim-Token.
    - Pruefung: Hash stimmt, nicht abgelaufen, nicht verbraucht  ->  sonst ABWEISEN
    - Pruefung: hostname, lokaler Nutzer und Geraetekennung stimmen  ->  sonst ABWEISEN
    - dann: Konto mit role='admin' anlegen (Argon2id), Token als verbraucht markieren,
      claim.txt LOESCHEN
4. Danach ist der Weg dicht: solange ein Benutzer existiert, wird KEIN Claim mehr erzeugt.
```

**Warum das Geraetekennungs-Feld und nicht nur der Hostname.** Ein Hostname ist eine
Behauptung; eine Datei mit Rechten `0600` im Home des lokalen Nutzers ist ein **Nachweis**.
Wer `claim.txt` auf einen anderen Rechner kopiert, scheitert an der Geraetekennung.

**Was ausdrücklich fehlt und fehlen soll:** keine voreingestellten Zugangsdaten, kein
`admin/admin`, kein Standardkennwort im Image. Ein Standardkennwort ist ein Hintertürchen, das
niemand schließt.

## 3. Das Isolationsprofil — „wie ein VPS"

**Der Betreiber sagt: jeder Benutzer bekommt seine eigene Container-Umgebung.** Der bestehende
`SandboxPolicy` beschreibt genau das. Die Verknüpfung, die fehlt:

```
Benutzer  ->  user_profiles  ->  SandboxPolicy  ->  Durchsetzung (landlock/pmh-sandbox)
```

**Die Vorgabe für einen neuen Benutzer — restriktiv, nicht freizügig:**

| Feld | Neuer Benutzer | Admin |
|---|---|---|
| `file_access` | `read-write` | `read-write` |
| `read_roots` | `[<benutzer-home>]` **und nichts sonst** | wie eingerichtet |
| `write_roots` | `[<benutzer-home>/workspace]` **und nichts sonst** | wie eingerichtet |
| `network` | **`false`** | `true` (der Agent muß den Anbieter erreichen) |
| `spawn` | **`false`** | wie eingerichtet |

**Warum `network: false` als Vorgabe und nicht `true`.** Ein Agent, der für einen fremden
Benutzer läuft, darf nicht ohne ausdrückliche Erteilung ins Netz. Wer den Anbieter erreichen
muß, bekommt es **ausdrücklich** — und das ist eine Entscheidung des Admins, keine stille
Voreinstellung.

**Warum das „wie ein VPS" hier ehrlich ist und wo es endet.** Die Grenze ist **prozessual, nicht
materiell**: alle Benutzer teilen denselben Kernel, denselben Harness-Prozessbaum und dieselbe
Datenbank. Ein echter VPS hat eigene Kernel-Namespaces. `landlock` ist ein
**Zugriffs**mechanismus, keine Trennung von Rechenzeit und Speicher — `pmh-sandbox` sagt das
selbst mit `Enforcement::Partial`. **Was fehlt und benannt gehört:** je Benutzer ein eigener
Prozess (heute gibt es keinen Mehrbenutzerbetrieb) und harte Ressourcengrenzen. Die Weisung
nennt beides: *„pro User/Session eine eigene Sandbox und nie ein gemeinsamer Harness-Prozess
für mehrere User"*.

## 4. Die Spiegelung der Befugnisse — der Kern der Weisung

**Die Regel in einem Satz:** *Der Agent handelt mit den Rechten des fragenden Benutzers. Er
bekommt niemals mehr, und er verliert sie nicht dadurch, daß er selbst mehr hätte.*

Das ist der Punkt, an dem ein Agent Amok laufen kann, wenn man ihn falsch baut: läuft der
Harness als `admin` und der Agent als Teil davon, dann **erbt** jede Werkzeugausführung die
Admin-Rechte — auch für die Anfrage eines normalen Benutzers. Der Benutzer wäre dann nur noch
eine Beschriftung.

**Zwei getrennte Größen, die nie vermischt werden dürfen:**

| | Was es ist | Woher es kommt |
|---|---|---|
| **Akteur** | der Benutzer, in dessen Auftrag gehandelt wird | die Anmeldung (`auth_sessions.user_id`) |
| **Herkunft** | `'benutzer'` oder `'harness'` | die Aufrufstelle, **nicht** der Akteur |

**Die Prüfung, bei jeder Aktion, fail-closed:**

```
darfAusfuehren(akteur, herkunft, aktion):
  1. Ist die Aktion dem AKTEUR erlaubt?          -> sonst ABWEISEN
     (z. B. „Datei in <fremdes-home> schreiben" ist keinem normalen Benutzer erlaubt)
  2. Verlangt die Aktion Admin-Recht?
     - Herkunft 'benutzer'  -> die Rolle des AKTEURS entscheidet; 'user' wird ABGEWIESEN
     - Herkunft 'harness'   -> nur mit ausdruecklicher, nicht faelschbarer Admin-Freigabe
  3. Ist die Aktion im Isolationsprofil des AKTEURS erlaubt?
     (file_access, roots, network, spawn)        -> sonst ABWEISEN
```

**Warum Schritt 3 zusätzlich zu Schritt 1 nötig ist.** Schritt 1 sagt, ob der Benutzer die
Aktion *überhaupt* darf. Schritt 3 sagt, ob sie in **seiner Umgebung** erlaubt ist. Ein
Benutzer darf Dateien schreiben — aber **nicht** in das Home eines anderen. Ohne Schritt 3 wäre
die Isolation eine Absicht.

**Warum `herkunft: 'harness'` eine eigene, ausdrückliche Freigabe braucht.** Der Harness darf
nicht deshalb mehr dürfen, weil er der Harness ist. Er muß die Freigabe **vorweisen** — dieselbe
Bauform wie die Freigabe in `services/pmh-nix` (Befund t13: `apply` ist ohne Freigabe und bei
Hash-Abweichung gesperrt, `propose` aktiviert nie). Was dort für Systemänderungen gebaut und
getestet ist, gilt hier für Werkzeugrechte.

**Und die Umkehrung, die genauso wichtig ist:** der Harness darf für einen Benutzer **nicht
weniger** dürfen, als der Benutzer selbst dürfte — sonst ist das System unbrauchbar und die
Regel wird umgangen, indem jemand einen zweiten Weg baut. Die Prüfung ist eine **Gleichheit**,
keine Obergrenze: *der Agent hat genau die Rechte des fragenden Benutzers.*

## 5. Der Ablauf im Ganzen

```
Erststart (0 Benutzer)
   └─ Claim erzeugen -> Konsole + <home>/claim.txt (0600), 15 min, einmalig
        └─ Claim einlösen -> Admin anlegen (Argon2id, role='admin')
             └─ Claim-Datei löschen, keine Claims mehr

Betrieb
   ├─ Admin legt Benutzer an   -> Vorgabeprofil: eigenes Home, kein Netz, kein spawn
   ├─ Admin aendert Profil     -> ausdrueckliche Handlung, protokolliert (auth_events)
   └─ Benutzer fragt den Agenten
        └─ Akteur = dieser Benutzer, Herkunft = 'benutzer'
             └─ jede Werkzeugausfuehrung: darfAusfuehren(...)  -> fail-closed
```

## 6. Was diese Entscheidung nicht tut — und was offen bleibt

* **Die Datenbank erzwingt noch nichts.** Befund **B-S1**: kein zusammengesetzter Fremdschlüssel,
  RLS auf allen elf Tabellen aus. Die Isolation ist heute **Anwendungssache** und damit eine
  Absicht. Sie wird erst echt, wenn die Datenbank mitspielt — sonst ist die erste
  mandantenübergreifende Abfrage das Leck.
* **Kein eigener Prozeß je Benutzer.** Heute gibt es keinen Mehrbenutzerbetrieb, also auch kein
  Risiko — es entsteht mit dem zweiten Benutzer. Dann ist es **Pflicht**, nicht Option.
* **`landlock` ist Linux only.** Unter Windows gibt es keinen gleichwertigen Nachweis;
  `pmh-sandbox` würde `Enforcement::Unusable` melden. Das ist ehrlich und muß so bleiben.
* **Der Claim schützt nicht gegen jemanden mit lokalem Zugang.** Er *soll* das auch nicht: wer
  lokal Zugang hat, ist ohnehin mächtiger. Der Claim schützt gegen **jeden anderen**, und das
  ist der Unterschied zu einem Standardkennwort.
* **Die Ressourcengrenzen sind nicht gemessen.** Das Profil nennt Rechenzeit und Speicher
  (Abschnitt 3); ob `pmh-sandbox` sie durchsetzt, ist **nicht geprüft** und gehört als
  offener Punkt geführt — nicht als Zusage.

## 7. Umsetzung — in dieser Reihenfolge

1. **Die Prüffunktion `darfAusfuehren`** (reine Logik, kein Datenbankbezug, prüfbar ohne
   laufenden Stapel). Sie ist der Kern der Weisung.
2. **Den Claim** samt Gerätebindung und Einmaligkeit.
3. **Migration 0004**: `user_profiles` (das Profil aus Abschnitt 3) und die Spalte für die
   Herkunft in `auth_events`.
4. **Die Admin-Schnittstelle** zum Anlegen und Ändern von Benutzern.
5. **Erst dann** RLS und die zusammengesetzten Fremdschlüssel (B-S1) — die Isolation ohne sie
   ist eine Absicht mit einem Schild davor.
