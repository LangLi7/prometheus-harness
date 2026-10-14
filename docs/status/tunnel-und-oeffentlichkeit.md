# Der Tunnel nach außen — und was er wirklich zeigt

> **Stand:** 14.10.2026, gemessen von diesem Rechner aus. **Was hier belegt wird:** auf diesem
> Rechner läuft ein **Cloudflare-Tunnel als Dienst** und führt **fünf** Dienste nach außen —
> darunter **SSH** und die **DSH-Weboberfläche**. Unsere Konto-Anmeldung (Prometheus, `:3081`)
> liegt **nicht** darin. Und die Frage „was ändert ein Tunnel an unserer Anmeldung?" hat
> **meßbare** Antworten, nicht gefühlte.
>
> **Die Hostnamen stehen hier absichtlich nicht.** Sie stehen vollständig in
> `~/.cloudflared/config.yml`; dieses Repository kann veröffentlicht werden, und die Namen
> eines privaten Netzes gehören nicht hinein. Ich nenne die **Ports** — die sind für die
> Sicherheitsfrage entscheidend, die Namen nicht.

---

## 1. Der Befund — gemessen, nicht vermutet

```powershell
Get-Service Cloudflared          # → Running, StartType: Automatic
Get-Process cloudflared          # → läuft (PID 5904)
& 'C:\Program Files (x86)\cloudflared\cloudflared.exe' --version   # → 2026.7.3
Test-Path ~/.cloudflared         # → cert.pem, config.yml, <tunnel-id>.json
```

Die Konfiguration (`~/.cloudflared/config.yml`) führt **fünf** Einträge:

| Dienst (Port am Ursprung) | was das ist | Antwort von außen (Kopf-Anfrage, gemessen) |
|---|---|---|
| `127.0.0.1:8787` | Hermes-Weboberfläche | **502** — Ursprung aus |
| `127.0.0.1:9119` | Hermes-Gateway/Dashboard (`noTLSVerify: true`) | **502** — Ursprung aus |
| `127.0.0.1:22` | **SSH** | (nicht mit `HEAD` meßbar) |
| `127.0.0.1:1234` | **LM Studio** (Modell-API) | **502** — Ursprung aus |
| `127.0.0.1:3080` | **DeepSeek-Harness-Webertoberfläche** | **200** — öffentlich erreichbar |

**Und der Prometheus-Host?** `127.0.0.1:3081` steht **nicht** in der Liste. Unsere Anmeldung ist
heute also **nicht** im Internet — sie ist es erst, wenn jemand sie einträgt.

---

## 2. Was ein Tunnel technisch ist — und warum er besser ist als eine Portfreigabe

Der Tunnel öffnet **keinen** eingehenden Port. `cloudflared` baut die Verbindung **von innen nach
außen** zu Cloudflare auf; die Öffentlichkeit spricht mit Cloudflare, Cloudflare schiebt durch den
Tunnel an `http://127.0.0.1:…`. Der Ursprung bleibt auf der **Schleife**.

Das paßt zu einer Eigenschaft, die der Kern selbst durchsetzt: der Webserver **lehnt eine
Wildcard-Adresse beim Laden ab** — *„The unspecified address … is rejected at load: it would
expose the port on every interface at once"* (`dsh-host-webserver/lib/types/index.d.ts:60-88`).
Ein Wildcard-Bind ist also gar nicht möglich; ein Tunnel ist der einzige bequeme Weg nach außen.

**Was der Tunnel nicht tut:** er authentifiziert **niemanden**. Er ist ein Rohr. Alles, was
hinter ihm schützt, muß der Dienst selbst tun — oder eine Zugriffsregel bei Cloudflare
(*Access*), die aber **nicht** in `config.yml` steht, sondern im Dashboard.

---

## 3. Was der Tunnel an **unserer** Anmeldung ändert — fünf meßbare Folgen

### (a) Die IP wird für **alle** zu `127.0.0.1` — und die IP-Grenze wird eine globale

`herkunft()` nimmt `req.socket.remoteAddress` und **niemals** `X-Forwarded-For`
(`packages/api/auth-http/src/http.ts:16-28`). Die Begründung steht dort und ist richtig:

> *„Diese Kopfzeile darf **jeder** Aufrufer setzen. Wer sie auswertet, läßt sich die IP von dem
> bestimmen, den er gerade begrenzen will."*

Hinter dem Tunnel ist der Socket-Peer **immer** `127.0.0.1`. Zwei Folgen:

1. **Die Prüfspur verliert die Herkunft.** `auth_events.ip` steht dann für jeden Besucher aus
   dem Internet als `127.0.0.1` — genau dort, wo die Spur am meisten wert wäre.
2. **Die Grenze je IP wird zur Grenze für alle.** Gemessen (`packages/auth/auth/src/rate-limit.ts:90-98`):
   `LOGIN_LIMITS.perIp = 20 je 15 Minuten`, `perAccount = 5 je 15 Minuten`,
   `REGISTER_LIMITS.perIp = 3 je Stunde`. Über den Tunnel zählen **alle** Angreifer zusammen auf
   einen Eintrag. Wer 20 Fehlversuche schickt, **sperrt damit die Anmeldung für den Betreiber**
   — und die Verzögerung (`slowAfter`, bis 4 s) trifft dann ebenfalls alle. Aus einer
   Angriffsbremse wird ein Werkzeug zur Aussperrung.

**Die richtige Antwort ist nicht „XFF doch auswerten", sondern: nur einem benannten Proxy
vertrauen.** Ein Schalter, der die Kopfzeile **nur** dann liest, wenn der Socket-Peer die
Schleife **und** der Proxy ausdrücklich konfiguriert ist (`PMH_VERTRAUENS_PROXY=cloudflared`),
wäre eng und prüfbar. Ohne diesen Schalter bleibt es beim Socket — und die Grenze bleibt global.

### (b) Der Token des Harness darf **nicht** durch eine Adreßzeile ins Internet

Gemessen über den Tunnel: `GET /api/pluginInventory/list` → **403 `forbidden`**, und der Körper
kommt **nicht** von Cloudflare, sondern vom Host (`Server: cloudflare` ist nur der Rand; kein
`cf-mitigated`, Körper wörtlich `forbidden`). **Das Tor hält also auch von außen.**

Trotzdem ist der Weg dorthin das Problem: der Betreiber holt den Token aus der **Konsole** und
gibt ihn in der Oberfläche ein — er landet damit in der **Adreßzeile**, im **Verlauf**, im
**Referrer** und in den **Zugriffsprotokollen von Cloudflare**. Dieser Token gilt für **alles**
(Dateien, Prozesse, Werkzeuge), hat **keine Rollen**, **wechselt nur beim Neustart** und läßt
sich **nicht einzeln widerrufen**. Ein Geheimnis mit diesen Eigenschaften gehört nicht in eine
Adreßzeile — schon gar nicht, wenn der Weg über einen fremden Rand führt.

### (c) Das eine Leck unseres Hosts wäre im Tunnel offen

Gemessen am Prometheus-Host: **`/plugins/events` antwortet 200 `text/event-stream` ohne Token**
(alle anderen Wege: 401, der WebSocket: 401 mit abgelehntem Upgrade). Heute ist das harmlos, weil
der Host nur auf der Schleife lauscht. Mit einem Tunnel-Eintrag auf `:3081` wäre es ein
**öffentlicher Ereignisstrom** des Harness. **Erst schließen, dann eintragen.**

### (d) Kein TLS am Ursprung, Kekse ohne `Secure`

`Umgebung.sicher` wird aus dem Protokoll **des Hosts** abgeleitet; der Host spricht `http:`
(gemessen: `angabenAus(process.env, protokoll)` in `auth-http/src/index.ts`). Also entstehen
`pmh_session` und `pmh_csrf` **ohne** `Secure` und ohne `__Host-`-Präfix. Hinter dem Tunnel ist
der Weg zum Browser HTTPS, der Weg Cloudflare → Ursprung aber nicht — und der Browser sieht das
`Secure`-Merkmal nicht, das er bräuchte, um den Keks nur über HTTPS zu senden.

**Zwei Wege, das zu heilen:** entweder der Host bekommt **eigenes TLS**
(`tls: { certFile, keyFile }` — der Kern kann das, und ein ungültiges Zertifikat **verhindert den
Start**, statt still auf HTTP zurückzufallen), oder man nimmt in Kauf, daß der letzte Meter
unverschlüsselt ist — dann muß man es **wissen**. Heute ist es unverschlüsselt.

### (e) Die Ratenbegrenzung ist je **Prozeß** — und fällt beim Neustart zurück

`MemoryRateLimiter` (gemessen, `rate-limit.ts:85-98`) lebt im Speicher des Hosts. Ein Neustart
setzt jeden Zähler zurück. Hinter einem Tunnel heißt das: wer einen Neustart auslösen kann (oder
abwartet), beginnt wieder bei null. Eine Grenze, die man durch Warten zurücksetzt, ist eine
Bremse, kein Riegel.

---

## 3a. „Ich komme auch ohne Token herein" — warum

Gemessen am 14.10.2026:

```
GET /                 ohne Keks   ->  401
GET /?token=…                     ->  303, location: ./
   set-cookie: dsh-auth-<Token>=…; Max-Age=2592000; Path=/; HttpOnly; SameSite=Strict
GET /                 mit Keks    ->  200
```

Der Keks trägt den Token **im Namen**, gilt **30 Tage** und wird ab dann bei jedem Aufruf
mitgeschickt. Deshalb geht `http://127.0.0.1:3081` im Browser ohne Token: der Browser **hat** ihn.
Die Tür ist nicht offen — der Schlüssel liegt in der Tasche.

Was das heißt:

- Der Keks **ist** der Schlüssel, keine Sitzungskennung. Wer ihn hat, hat alles: Dateien,
  Prozesse, Werkzeuge. Keine Rollen, kein einzelner Widerruf, 30 Tage Laufzeit.
- `HttpOnly` ist gut — Seitenskripte können ihn nicht lesen. `Secure` fehlt, weil der Rechner
  kein TLS spricht.
- Auf einem **öffentlichen** Hostnamen ist das ein 30 Tage gültiger Generalschlüssel im
  Browserprofil. Wer das Profil liest oder eine böse Erweiterung hat, ist drin.

**Die Konto-Anmeldung ändert daran nichts.** Sie ist die zweite Tür und gibt heute **keinen**
Zugang zur Oberfläche. Genau das steht auf `/start`.

**Wie man es selbst prüft:** ein Inkognito-Fenster (dort ist kein Keks) — `/` antwortet 401.

## 4. Was am DSH-Host selbst gemessen ist
| Frage | Antwort (gemessen) |
|---|---|
| Startseite von außen | **200**, `text/html`, 16 003 Zeichen |
| Steht ein Geheimnis im öffentlichen HTML? | **Nein.** 0 Treffer auf `token`/`secret`/`passwort`; der Boot-Anteil trägt die Schlüssel `rev, entries, id, url, inject, immediately` und **keine** langen Zufallswerte |
| Was verrät die Seite also? | die **Liste der geladenen Erweiterungen** samt Adressen — Fingerabdrücke. Kein Geheimnis, aber eine Vorlage für die Wahl eines Angriffs |
| Ist die API gesperrt? | **ja**: `/api/pluginInventory/list` → **403 `forbidden`** (vom Host, nicht von Cloudflare) |
| Liegt Access davor? | **kein Hinweis darauf**: eine Access-geschützte Adresse antwortet mit einer Umleitung auf `*.cloudflareaccess.com`, hier kam direkt **200**. Das ist ein **Hinweis, kein Beweis** — die Regel steht im Dashboard, nicht in `config.yml` |

**Zu SSH (`:22`) und LM Studio (`:1234`).** Beide stehen im Tunnel. Ein SSH-Zugang über
Cloudflare funktioniert **nur** mit einer Access-Regel davor; fehlt sie, ist der Weg offen für
jeden, der `cloudflared access ssh` bedienen kann. Und eine Modell-API ohne Anmeldung ist ein
**fremder Rechenknecht** — schlimmstenfalls einer, der Werkzeuge auf diesem Rechner ausführen
darf. Ob dort eine Regel liegt, kann ich von hier **nicht** messen; das Dashboard ist die
einzige Quelle.

### Der ungesicherte Kanal ist **öffentlich** — gemessen

Der Pfad `/plugins/events` ist die **HMR-Röhre des Kerns** (`node_modules/@deepseek-ai/dsh-client-hmr/lib/index.js:5`,
`EVENTS_ENDPOINT = "/plugins/events"`). Sie ist der **einzige** Weg am Host, der **ohne Token**
antwortet — am Prometheus-Host wie am DSH-Host. Am 14.10.2026 von außen gemessen:

```
curl.exe -s -N --max-time 5 -i 'https://deepseek.changchi.space/plugins/events'
  → HTTP/1.1 200 OK
    Content-Type: text/event-stream
    (Ereignis `graph` mit der Plugin-Liste: JA)
```

**Was das verrät.** Den **Plugin-Graphen** (Kennungen, Adressen, `rev`) und — bei einem Neubau —
die Meldung, daß sich etwas geändert hat. **Was es nicht verrät** (im Fenster von 4 Sekunden
gemessen): **keine** Geheimnisse — 0 Treffer auf `token`/`secret`/`passwort`/`api_key`. Der
Gewinn für einen Angreifer ist damit gering: dieselbe Plugin-Liste steht ohnehin im öffentlichen
Start-HTML (`__DSH_BOOT__`). **Der Befund ist das Muster**, nicht der Inhalt: eine Route ohne
Token auf einem Host, der im Internet steht.

**Warum ich sie nicht selbst schließe.** Die Route gehört einem **fremden** Paket des Kerns
(`@deepseek-ai/dsh-client-hmr`), nicht unserem Baum. Sie zu schließen heißt, ein Kernpaket zu
patchen — und der letzte Versuch, ein Kernpaket zu patchen, hat den Host mit **167
Importfehlern** nicht mehr starten lassen (siehe `arbeitsweise.md`, Metadaten-Patch). **Die
billigste Abhilfe kostet keinen Code:** eine Regel am Rand (Cloudflare → WAF → `/plugins/events`
sperren) oder Access vor den Hostnamen. Beides gehört ins Dashboard, nicht in dieses Repository.

---

## 5. Was zu tun ist — in dieser Reihenfolge

1. **Im Dashboard nachsehen**, ob Cloudflare **Access** vor den Einträgen liegt (Zero Trust →
   Access → Applications). Der 200 ohne Umleitung ist der Anlaß, das zu prüfen — nicht der Beweis.
2. **SSH-Eintrag** entfernen oder hinter Access legen. Ein Tunnel, der Port 22 führt, hebt den
   wichtigsten Netzschutz dieses Rechners auf.
3. **LM Studio (`:1234`)** nicht nach außen führen, solange es keine Anmeldung hat.
4. **Den Harness-Token nicht durch eine Adreßzeile über das Internet tragen.** Entweder Access
   als Tür **vor** die Oberfläche, oder ein eigener, kurzlebiger, widerrufbarer Zugang.
5. **`/plugins/events` schließen** (oder an den Token binden) — **bevor** `:3081` in den Tunnel
   kommt.
6. Erst dann über einen Eintrag für **`127.0.0.1:3081`** nachdenken — und dabei (a) und (d) lösen:
   vertrauenswürdiger Proxy **ausdrücklich** konfigurieren (`CF-Connecting-IP` für Spur und
   Grenze) oder die Grenze bewußt global lassen; und TLS am Ursprung oder die Kekse bleiben ohne
   `Secure`.

---

## 6. Nachfahren

```powershell
# Was läuft und was ist eingerichtet?
Get-Service Cloudflared; Get-Process cloudflared
Get-Content ~\.cloudflared\config.yml          # Hostnamen und Ursprungsports

# Antwortet der Rand, und wer antwortet wirklich? (Kopf-Anfrage, keine Weiterleitung)
curl.exe -s -i -m 12 'https://<host>/' | Select-Object -First 12
curl.exe -s -i -m 12 'https://<host>/api/pluginInventory/list' | Select-Object -First 12
#   Access   -> HTTP 302 auf *.cloudflareaccess.com
#   unser Tor-> HTTP 403 mit dem Körper `forbidden`
#   offen    -> HTTP 200 und Inhalt

# Der eigene Host: nur Schleife?
netstat -ano | Select-String ':3081.*ABH'
```
