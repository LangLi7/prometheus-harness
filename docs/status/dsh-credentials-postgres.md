# DSH-Credentials in Postgres — Befund, Migration und Provider

**Stand:** 18.10.2026 · **Gemessen:** `pmh` auf `127.0.0.1:5432`, Rolle `pmh_app`

## 1. Der Befund vor dem Bau

| Frage | Messung |
|---|---|
| Datenbank / Schema / Rolle | `pmh` · `pmh` · `pmh_app` |
| Migrationen | **10** (`0001`–`0010`), nächste **0011** |
| `user_secrets` | vorhanden, **0 Zeilen** |
| `credential_records` | **fehlte** |
| Benutzer | **5** — genau **1 Admin**, 4 Benutzer |
| RLS auf `user_secrets` | **aus** (wie in Migration 0004 begründet; der Speicher filtert über `user_id`) |
| `.credentials.yaml` der **aktiven** DSH | `C:\Users\Chang\prometheus-harness\.pmh-build\harness-home\.credentials.yaml` — **1 ref** (`DEEPSEEK_API_KEY`), **1 record** (`client-connection/browser-session`, `grant`) |
| `.credentials.yaml` unter `~/.dsh` | **13 refs**, **1 record** — gehört zu einer **anderen** DSH-Installation, nicht zu dieser Sitzung |

**Die wichtige Unterscheidung:** `DSH_HOME` dieser Sitzung ist `.pmh-build/harness-home`, nicht
`~/.dsh`. Der Import hat deshalb **die aktive Datei** gelesen — nur DeepSeek, passend zum grünen
Punkt in der Models-Seite. Die 13 Refs unter `~/.dsh` sind nicht automatisch die Keys dieses Harness.

## 2. Was gebaut wurde

### 2.1 Migration `0011_credential_records.sql`

`user_secrets` trägt **Referenzen** (`DEEPSEEK_API_KEY`). Die Credential-Seam kennt daneben
**Records** unter `<scope>/<id>`; deren Rumpf ist JSON, den nur der Besitzer versteht. Deshalb eine
eigene Tabelle:

| Spalte | Zweck |
|---|---|
| `user_id` | Mandant, `ON DELETE CASCADE` |
| `key` | `<scope>/<id>`, per CHECK auf die Grammatik der Seam begrenzt |
| `kind` | `api-key` oder `grant` |
| `payload_cipher` | der JSON-Rumpf, mit dem Datenschlüssel verschlüsselt |
| `wrapped_key` | der Datenschlüssel, mit dem Hauptschlüssel verschlüsselt |
| `master_key_version` | welche Fassung den Umschlag öffnet |

**Kein `key_hint`** — der Rumpf ist für die Seam undurchsichtig; ein Hinweis darauf wäre eine zweite
Aussage über ein Geheimnis, die niemand braucht. **Keine RLS**, wie `user_secrets`; der Provider
filtert jede Abfrage über `user_id`.

**Sicherung vor der Migration:** `pmh-schema-vor-0011-20261018-213555.sql` (42 885 Byte,
`pg_dump --schema-only`, ohne Eigentümer/Rechte) unter `.pmh-build/backups/`.

**Angewendet:** `schema_migrations` trägt jetzt Fassung **11**; `credential_records` existiert mit
neun Spalten.

### 2.2 Import `scripts/dsh-keys-import.mjs`

- liest die **aktive** `.credentials.yaml` (`DSH_HOME`, sonst `~/.dsh`);
- zeigt im Trockenlauf nur `ref`-Namen und Record-Adressen — **keine Werte**;
- `--schreiben` legt `refs` in `user_secrets` und `records` in `credential_records` ab;
- sichert die Datei vorher als `.bak-<ISO>`; löscht sie **nicht** (der lokale Provider braucht sie noch);
- `--ueberschreiben` ist nötig, wenn für das Konto schon Zeilen liegen.

**Gemessener Lauf:**

```text
Quelle: …\.pmh-build\harness-home\.credentials.yaml
  refs:    1 (DEEPSEEK_API_KEY)
  records: 1 (client-connection/browser-session [grant])
Sicherung: …\.credentials.yaml.bak-2026-10-18T19-36-05-873Z
Geschrieben: 2 Zeilen (1 refs, 1 records).
```

**Danach in Postgres** (ohne Werte):

```text
DEEPSEEK_API_KEY   Fassung 1   Hinweis e2159c3d
client-connection/browser-session  grant  Fassung 1
```

### 2.3 Provider `@prometheus-harness/dsh-credentials-postgres`

`packages/auth/credentials-postgres` implementiert die `CredentialProvider`-Seam:

| Methode | Ablage |
|---|---|
| `resolve(ref)` | Prozeßumgebung zuerst, dann `user_secrets` (entschlüsselt) |
| `describe(ref)` | gesetzt / Quelle / `writable` — **ohne Wert** |
| `set(ref, value)` | `speichereGeheimnis`; verweigert, wenn die Umgebung den Ref überdeckt |
| `unset(ref)` | `loescheGeheimnis` |
| `readRecord(key)` | `ladeCredentialRecord` (JSON entschlüsselt) |
| `describeRecord(key)` | Vorhandensein + Art, ohne Rumpf |
| `listRecords()` | Adresse + Art, ohne Rumpf |
| `modifyRecord(key, mutate)` | `SELECT … FOR UPDATE` + Upsert in **einer** Transaktion |
| `deleteRecord(key)` | `loescheCredentialRecord` |

**Ein Konto, nicht viele.** Der Harness ist ein Host-Prozess; ein Modellaufruf trägt keine
Prometheus-Sitzung. Der Provider nimmt `benutzer` aus der Config oder den **einzigen** Admin. Die
per-User-Ablage bleibt im Prometheus-`/token`.

**Gemessener Rauchtest gegen die echte DB** (kein Wert ausgegeben):

```text
DESCRIBE  {"configured":true,"source":"postgres","writable":true}
RESOLVE   value-len=35 source=postgres
RECORDS   [{"key":"client-connection/browser-session","kind":"grant"}]
RECORD    kind=grant
SET/UNSET PMH_PROVIDER_TEST_KEY → configured true → false
MODIFY    test/temp [api-key] → describe true → delete → false
```

## 3. Was noch fehlt — und warum es ein eigener Schritt ist

| Schritt | Warum |
|---|---|
| **Profil `pgkeys`** | Der Provider sitzt im Boot-Pfad. Ein fehlerhafter Provider heißt „DSH startet nicht". Er wird zuerst in einem **eigenen Profil** eingehängt, nicht im laufenden Web-Profil. |
| **Provider ins Profil installieren** | `dsh plugin --profile pgkeys add file:C:\…\packages\auth\credentials-postgres`; die Profil-Node-Module müssen das Paket auflösen. |
| **`.credentials.yaml` löschen** | Erst **nach** einem erfolgreichen Boot mit dem Postgres-Provider. Vorher ist die Datei die einzige Quelle des lokalen Providers. |
| **Config in Postgres** | Bewusst **nicht** gebaut: `settings.yaml`/`cordis.patch.yml` tragen **Verweise**, keine Werte. Eine Config-Ablage wäre ein eigener Settings-Provider, keine Credential-Frage. |
| **Per-User im DSH-Settings** | DSH hat keine Sitzung pro Modellaufruf. Ein per-User-Key-Manager gehört in die Prometheus-Oberfläche; dort gibt es die Sitzung. |
| **Export/Import** | Als **verschlüsselter** Bundle (Passphrase), nicht als Klartext-YAML. Noch nicht gebaut. |

## 4. Reproduktion

```powershell
# Trockenlauf — keine Werte
bun scripts/dsh-keys-import.mjs

# Schreiben (einmalig, mit Sicherung)
bun scripts/dsh-keys-import.mjs --schreiben

# Provider-Rauchtest (Werte werden nicht ausgegeben)
bun -e "…"
```

Die Migration ist additiv; die Sicherung liegt außerhalb des Repos unter `.pmh-build/backups/`.
