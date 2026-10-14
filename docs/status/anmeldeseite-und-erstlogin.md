# Die Anmeldeseite — und die gemessene Aussperrung der Betriebsdatenbank

> **Stand:** 13.10.2026 · **Was hier belegt wird:** die Anmeldeseite aus dem eigenen
> Host (`12` Prüfungen), die Erstinbetriebnahme in allen Verzweigungen (`10`
> Prüfungen) und **der Zustand der Betriebsdatenbank**, gemessen.
>
> **Der eine Satz, auf den es ankommt:** die Betriebsdatenbank ist **ausgesperrt**
> — `benutzer=3, admins=0`, keine `claim.txt` — und die Wiederherstellung ist
> **ein Befehl**. Beides steht unten mit Messung.

---

## 1. Was gebaut wurde

| Datei | Was darin steht |
|---|---|
| `packages/api/auth-http/src/seite.ts` | HTML, CSS und JavaScript der Anmeldeseite — **keine** Fremdressource, **eigene** CSP |
| `packages/api/auth-http/src/index.ts` | drei zusätzliche Wege, **additiv** neben den vier bewiesenen |
| `packages/api/auth-http/tests/seite.test.ts` | **12** Prüfungen über einen echten Socket |
| `packages/api/auth-http/tests/erstlogin.test.ts` | **10** Prüfungen der Erstinbetriebnahme gegen echtes PostgreSQL |

**Die vier Wege bleiben unberührt.** Die Seite entscheidet **keine** Regel: schwaches
Paßwort, vergebene Adresse, gesperrtes Konto, fehlender Claim, CSRF — alles liegt in
`wege.ts`. Eine Oberfläche, die eine Regel nachbaut, hat sie zweimal, und die zweite
ist die falsche.

---

## 2. Der gemessene Zustand der Betriebsdatenbank

```sql
SELECT count(*), count(*) FILTER (WHERE role='admin') FROM pmh.users;
```

```
benutzer=3  admins=0  gesperrt=0
sitzungen_offen=0  sitzungen_gesamt=0
api_keys=0  einmaltoken=0  user_secrets=0  profile=0
```

Und im Harness-Home (`C:\Users\Chang\.pmh`):

```
claim.txt FEHLT        (auch sonst nirgends eine claim*.txt gefunden)
geraet  FEHLT          master.key  FEHLT
```

**Was das bedeutet.** Das Tor der Registrierung ist
`erstinbetriebnahmeOffen(anzahl) || admins === 0` (`wege.ts:282`). Mit `admins = 0`
ist es **offen** — aber der offene Weg verlangt ein **Claim-Token**, und ohne
`claim.txt` gibt es keines. Der andere Weg (angemeldeter Admin) ist unerreichbar,
weil es keinen Admin gibt. **Ergebnis: niemand kann ein Konto anlegen.**

Das ist kein Verdacht mehr, sondern gemessen (`erstlogin.test.ts`): bei
`benutzer=2, admins=0, keine Claim-Datei` antwortet der Weg mit **403 `claim-fehlt`**.

> **Und es ist mein Fehler.** Genau diesen Zustand (`benutzer=4, admins=0`) habe ich
> in `wege.ts` als Begründung dafür aufgeschrieben, das Tor mit `|| admins === 0`
> **offen** zu halten — *„das Tor hätte daraus eine Aussperrung gemacht."* Offen ist
> es auch. Nur nützt ein offenes Tor nichts, wenn das Geheimnis fehlt, das
> hineinführt. Die Lücke ist nicht das Tor, sondern **der Schlüssel dazu**.

### Die Wiederherstellung ist ein Befehl

```powershell
$env:PMH_HOME = 'C:\Users\Chang\.pmh'      # NICHT ~/.dsh
& 'C:\Users\Chang\.bun\bin\bun.exe' scripts/claim.mjs
# -> legt geraet + claim.txt (0600) im Home an und zeigt den Token
# dann im Browser: /pmh/anmelden -> "Erstes Konto anlegen" mit diesem Token
```

Geprüft, nicht behauptet (`erstlogin.test.ts`, Fall *„DIE WIEDERHERSTELLUNG IST EIN
BEFEHL"*): aus `benutzer=2, admins=0` entsteht mit einem frischen Claim ein Konto mit
Rolle **`admin`**, Status **201**, und `zaehleAdmins` ist danach **1**.

**Warum das überhaupt geht.** `admins === 0` hält das Tor offen. Gäbe es einen Admin
und wäre der Claim weg, wäre der Weg über den angemeldeten Administrator der einzige
— und ohne dessen Paßwort niemand hinein. Der zweite Teil der Bedingung ist also
nicht nur eine Notlücke, er ist der **Rettungsweg**.

---

## 3. Die Erstinbetriebnahme in allen Verzweigungen

| Fall | Erwartung | Ergebnis |
|---|---|---|
| zwei Benutzer, kein Admin, keine Claim-Datei | Vorbedingung steht | ✓ |
| ohne Claim-Token | **403 `claim-fehlt`** — und kein Konto entsteht | ✓ |
| erfundenes Claim-Token | 403, Code beginnt mit `claim-` | ✓ |
| **frischer Claim** | **201, Rolle `admin`**, Datei danach **weg**, `zaehleAdmins = 1` | ✓ |
| derselbe Claim ein zweites Mal | 403 — und **nicht** `claim-fehlt`, sondern „verbraucht" | ✓ |
| ein Admin existiert | 401 `nicht-angemeldet` (der Claim-Weg ist zu) | ✓ |
| abgelaufene Claim-Datei (30 Tage) | 403 | ✓ |
| fremdes Home | 403 — die Bindung an den Rechner greift | ✓ |

**Jeder Fall stellt seinen Zustand selbst her** (`zustand(benutzer, admins)` schreibt
direkt in die Datenbank). Kein Fall ist nur grün, wenn ein anderer vorher lief — eine
Prüfdatei, die von der Reihenfolge abhängt, ist keine Prüfung, sondern eine Reihenfolge.

---

## 4. Die Anmeldeseite: vier Entscheidungen

| Entscheidung | Warum |
|---|---|
| **kein Byte Fremdressource** | kein CDN, kein Zählpixel, keine Schriftart von außen. Geprüft: `HTML` und `JS` enthalten **kein** `http://` oder `https://` |
| **JavaScript in eigener Datei**, nicht inline | nur so ist eine CSP **ohne** `'unsafe-inline'` für Skripte möglich. Eingebettetes JavaScript mit `'unsafe-inline'` erlaubt jedem eingeschmuggelten Stück Code, im Namen des Angemeldeten zu laufen |
| **`default-src 'none'`** | Bilder, Rahmen, Formulare nach außen: aus. `form-action 'none'`, weil die Formulare per `fetch` gehen — ein eingeschmuggeltes `form action` kann nichts nach außen tragen |
| **nichts wird im Browser abgelegt** | kein `localStorage`, kein `sessionStorage`, kein `document.cookie =`. Ein Paßwort im Browserspeicher steht dort, bis jemand es löscht |

**Die Namen kommen vom Server, nicht aus der Seite.** Das JavaScript wird mit den
Pfaden aus `wege.ts` und dem CSRF-Cookienamen aus dem Regelkern ausgeliefert
(`JSON.stringify(CSRF_COOKIE_NAME)`). Ein abgeschriebener Name liefe irgendwann
auseinander, und das Abmelden ginge **still** kaputt. Geprüft: *„das JavaScript liest
den CSRF-Wert aus dem Cookie — mit dem Namen des Kerns"*.

**Der CSRF-Wert kommt aus dem lesbaren Cookie**, weil das Sitzungscookie `HttpOnly`
ist — genau dafür gibt es das zweite.

### Was die Seite **nicht** kann, und das ist offen benannt

| Offen | Warum |
|---|---|
| **kein Konto anlegen für weitere Benutzer** | der Weg `register` als Admin braucht eine Sitzung **und** einen CSRF-Wert; die Seite zeigt ihn nicht. Ein angemeldeter Admin kann heute **keine** weiteren Konten anlegen — nur die Erstinbetriebnahme geht |
| **keine Geräteliste, kein Abmelden einzelner Sitzungen** | `SessionStore` hat keine Methode „alle Sitzungen eines Benutzers" und `revokeSession(id)` wird nur für die **eigene** Sitzung gerufen |
| **kein Paßwortwechsel** | es gibt keinen Weg dafür |
| **kein Browser-Nachweis** | die 12 Prüfungen fahren den Weg über einen echten Socket, **nicht** einen Browser. Daß ein Browser die Seite bedienen kann, ist damit **nicht** belegt — das braucht einen laufenden Host und einen Browser |
| **kein TLS** | `Secure` und `__Host-` greifen erst mit TLS; heute läuft es ohne (`auth-im-host.md:309`) |

---

## 5. Eigene Fehler auf dem Weg

| Fehler | Wie er auffiel |
|---|---|
| **Backticks in Kommentaren** des JavaScript-Blocks | sie **beenden** das Template-Literal. Vier Typfehler (`TS1005`), gefunden vom Typlauf — nicht vom Nachdenken. Gemessen mit einem Durchlauf über alle Zeilen der Datei, statt einzeln zu raten |
| eine Zusicherung auf **`'pmh_'`** (Wortstumpf) | rot, zu Recht: `pmh_` steckt auch in `/api/pmh/auth/login` und im Cookienamen `pmh_csrf`. Jetzt wird die **Form** geprüft, in der ein Geheimnis aufträte (`pmh_<12>_<43>`, 64 Hexzeichen) |
| `userAgent` weggelassen | Pflichtfeld in `RegistrierEingabe`; der Typlauf hat es belegt |
| `SEITEN_KOEPFE['content-security-policy']` | durch `noUncheckedIndexedAccess` vom Typ `string \| undefined` — eine Zusicherung mit einem Wert, der auch fehlen könnte. Jetzt eine benannte Konstante `CSP` |
| **erfundener Bezeichner** (`DOMAEAENE_HILFE`) und eine Vorbedingung, die 2 erwartete und 1 herstellte | beim Durchlesen der eigenen Datei gesehen, vor dem ersten Lauf. Die Datei wurde **neu geschrieben**, nicht geflickt |

---

## 6. Zahlen

| Messung | Wert |
|---|---|
| Typprüfung | **25 Pakete grün, 0 rot** |
| Voller Lauf, **dreimal in Folge** | **1174 pass, 2 fail** in 47 Dateien |
| Die zwei roten | `packages/util/atomic-write` (`os error 5`, `TEMP`) und `apps/cli` (typert-loader: *2 required plugins did not activate*) — **beide nicht unsere** |
| **Ein** Lauf zeigte **1166 pass, 10 fail** | **nicht reproduziert.** Die Summe blieb in beiden Fällen **1176**. Ich kenne die Ursache **nicht** und behaupte keine: dreimal danach war es wieder 2 |
| Neue Prüfungen | **22** (12 Seite + 10 Erstinbetriebnahme) |
| `apps/cli` allein | 0 pass, **1** fail — die Datei scheitert beim **Laden** (dateiweiter Fehler) |

---

## 7. Nachfahren

```powershell
$map = @{}; foreach ($l in (Get-Content .env)) { if ($l -match '^\s*([A-Za-z_]\w*)\s*=') { $k,$v = $l -split '=',2; $map[$k.Trim()] = $v.Trim() } }
$env:PMH_TEST_DATABASE_URL = $map['MIGRATION_DATABASE_URL'] -replace '/pmh(\?|$)','/pmh_test$1'
$BUN = 'C:\Users\Chang\.bun\bin\bun.exe'
& $BUN test packages/api/auth-http/tests/seite.test.ts        # 12 pass
& $BUN test packages/api/auth-http/tests/erstlogin.test.ts    # 10 pass
```

Beide Dateien legen ihr **eigenes** Home an (`mkdtempSync`) — weder `~/.pmh` noch
`~/.dsh` werden angefaßt. Die Claim-Datei der Prüfung entsteht in einem
Wegwerf-Verzeichnis und wird danach gelöscht.

---

## 8. Die **zweite** Seite: `apps/login_web` (eigenständige Anwendung)

> **Stand:** 14.10.2026 · **Gemessen:** Bau exit 0 · Weiterleiter **8/8** · Sonde
> **11/11**, exit 0.

**Warum es jetzt zwei Anmeldeseiten gibt — und warum das offen dasteht.** §1 beschreibt
die Seite, die der **Host selbst ausliefert** (`packages/api/auth-http/src/seite.ts`); sie
ist am echten Tor erreichbar und mit 12 Prüfungen belegt. Danach hat der Betreiber eine
**eigene Anwendung** verlangt (`apps/login_web`, React + Vite), weil später eine
**Einstellung** steuern soll, wohin es nach der Anmeldung weitergeht. Eine Tür mit zwei
Seiten ist eine Doppelung. Sie ist hier benannt, nicht weggeredet:

| | `auth-http/src/seite.ts` | `apps/login_web` |
|---|---|---|
| wer liefert aus | der Host, am echten Tor | ein Entwicklungsserver auf `:5180` |
| belegt durch | 12 Prüfungen über einen echten Socket | 8 Prüfungen (Weiterleiter) + 11 Sondenprüfungen |
| heute erreichbar | **ja**, ohne Harness-Token | **nein** — nicht am Host eingehängt |
| Regeln | liegen in `wege.ts`, die Seite entscheidet nichts | ebenso: die Seite zeigt die Meldung des Servers **wörtlich** |

**Der Proxy ist eine Bedingung, keine Bequemlichkeit.** Unsere Anmeldung setzt ihre Kekse
mit `SameSite=Strict` (gemessen: `pmh_session; HttpOnly; SameSite=Strict`, `pmh_csrf;
SameSite=Strict`). Ein solcher Keks kommt **nur** bei **derselben Herkunft** an. Liefe die
Seite auf `:5180` und die API auf `:3081`, wäre die Anmeldung **still wirkungslos**.
Deshalb leitet `vite.config.ts` `/api` an den Host weiter — dieselbe Herkunft, in
Produktion über den Host selbst.

**Der Port ist gemessen worden, nicht geraten.** `5173` und `5176` sind auf diesem Rechner
belegt; auf `5176` lauschte ein **fremder** Vite-Server („Prometheus — Welt-Prototyp",
PID 32288). Mein erster Startversuch hat ihn getroffen. Deshalb: **`5180`** und
`strictPort: true` — ist der Port weg, bricht der Start **laut** ab, statt heimlich
woanders zu lauschen, wo ich dann eine **fremde** Seite messen würde. Die Sonde prüft das
als erste Bedingung mit **Gegenstück** (`docs/status/anmeldeseite-proxy-sonde.mjs`): unsere
Kennung muß vorkommen, „Welt-Prototyp" darf **nicht** vorkommen.

```powershell
# Fenster 1
cd apps\login_web; & 'C:\Users\Chang\.bun\bin\bun.exe' run dev
# Fenster 2
& 'C:\Users\Chang\.bun\bin\bun.exe' docs/status/anmeldeseite-proxy-sonde.mjs
```

**Was hier offen ist.** Kein Automatismus nach der Anmeldung (`AUTOMATISCH_WEITER =
false`): die Seite **zeigt** den Weg und läßt ihn anklicken — die Einstellung gibt es noch
nicht. Kein Browser-Nachweis (auf diesem Rechner ist **kein** Browser installiert; die
Sonde fährt HTTP, keinen Browser). Nicht am Harness-Token beteiligt: die Oberfläche
authentifiziert sich weiterhin über den Token aus der Host-Konsole, diese Seite baut die
**Konto**-Tür. Und der Weiterleiter nimmt **nur relative Ziele** (`?weiter=…`): fremde
Herkünfte, `//host`, `/\host`, Rückstriche und Steuerzeichen fallen auf die Vorgabe
zurück — sonst wäre die Seite ein offener Weiterleiter, und der Betroffene hätte gerade
sein Kennwort eingegeben.
