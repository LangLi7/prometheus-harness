# `pmh-crypto` — kryptografische Primitive als Prozess (Rust)

> **Kein Gegenstück in der Vorlage** in dieser Form: die Vorlage hält ihre Hashing-Logik in
> TypeScript (`packages/util/crypto`).
> **Mapping:** [`../../MAPPING.md`](../../MAPPING.md) §3.7 und §6.2
> **Doku-Grundlage:** [`../../docs/stack.md`](../../docs/stack.md) nennt „Kryptografie" als
> Rust-Aufgabe.

## Was es tut

Stellt die Primitive bereit, die der Harness heute wirklich braucht — hinter einer
Prozessgrenze, damit der Kern eine geprüfte, speichersichere Umsetzung benutzen kann, **ohne**
ein natives Addon auszuliefern.

## Aufruf

```text
pmh-crypto sha256  [--file <path> | --text <value> | --stdin] [--raw]
pmh-crypto hmac    --key <value|@file> [--file <path> | --text <value> | --stdin] [--raw]
pmh-crypto compare --a <hex|@file|text> --b <hex|@file|text>
pmh-crypto random  [--bytes <n>]
pmh-crypto probe
```

Digests gehen als **kleingeschriebenes Hex**, eine Zeile, ohne Verzierung auf stdout — damit
die Ausgabe direkt verglichen oder gepipet werden kann. `--raw` schreibt stattdessen die
rohen Digest-Bytes.

| Exit-Code | Bedeutung |
|---|---|
| `0` | Erfolg; bei `compare`: die Operanden sind **gleich** |
| `1` | nur bei `compare`: die Operanden sind **verschieden** (eine gültige Antwort, kein Fehler) |
| `125` | Fehler (stderr: JSON-Objekt) |

## Was drin ist

| Primitiv | Umsetzung | Wofür im Harness |
|---|---|---|
| **SHA-256** | aus FIPS 180-4, inkrementell (`update`/`finalize`) | Inhalts-Hashing, Cache-Schlüssel, Integritätsprüfungen |
| **HMAC-SHA-256** | aus RFC 2104 | Nachrichten-Authentifizierung, signierte Werte |
| **Konstantzeit-Vergleich** | eigener Akkumulator, läuft immer bis zur Länge des längeren Operanden | Token- und MAC-Prüfung |
| **Zufallstoken** | `/dev/urandom` bzw. `BCryptGenRandom` | Sitzungstoken, Nonces |

## Was **bewusst nicht** drin ist

**Keine Verschlüsselung, kein Passwort-Hashing.** Beides braucht Primitive (AEAD, eine
speicherharte KDF), die man **nicht selbst schreibt**, und sie hier zu erfinden wäre
schlechter als sie nicht zu haben. Ein Aufrufer, der sie braucht, soll eine geprüfte
Umsetzung hinzufügen — dank der Prozessgrenze ist das eine Änderung **innerhalb dieses
Binaries**, nicht quer durch den Kern.

`probe` sagt das ausdrücklich: `"aead":false,"kdf":false`.

## Fehlercodes

| Code | Bedeutung |
|---|---|
| `ERR_CRYPTO_USAGE` | Nutzungsfehler |
| `ERR_CRYPTO_READ` | Eingabe- oder Schlüsseldatei nicht lesbar |
| `ERR_CRYPTO_HEX` | Hex-Eingabe mit ungerader Länge oder Nicht-Hex-Zeichen |
| `ERR_CRYPTO_RANDOM` | Zufallsquelle nicht verfügbar oder Byte-Anzahl außerhalb `1 … 4096` |

## Warum die Tests die veröffentlichten Vektoren benutzen

Ein Hash lässt sich nicht durch einen internen Round-Trip prüfen — dabei stimmt eine falsche
Umsetzung mit sich selbst überein. Die Tests prüfen deshalb gegen die **veröffentlichten
Vektoren** aus FIPS 180-4 und RFC 4231:

- SHA-256: leerer String, `"abc"`, die 56-Byte- und die 112-Byte-NIST-Nachricht, der
  Millionen-`a`-Vektor (strömend in 1000er-Blöcken), die Blockgrenzen 55/56/63/64 Bytes
- HMAC-SHA-256: RFC-4231-Testfälle 1, 2, 3 und 6 (letzterer mit einem Schlüssel länger als
  der Block)
- zusätzlich: **Streaming stimmt für jeden Split-Punkt** mit dem Ein-Schuss-Ergebnis überein
  (12 Splits, inklusive der Padding-Grenzen)

## Bauen und Testen

```powershell
cargo build -p pmh-crypto
cargo test  -p pmh-crypto
```

Von Hand:

```powershell
.\target\debug\pmh-crypto.exe probe
.\target\debug\pmh-crypto.exe sha256 --text abc
# ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad

.\target\debug\pmh-crypto.exe hmac --key Jefe --text "what do ya want for nothing?"
# 5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843

.\target\debug\pmh-crypto.exe random --bytes 32
.\target\debug\pmh-crypto.exe compare --a abc --b abc; echo "exit=$? (0)"
.\target\debug\pmh-crypto.exe compare --a abc --b abd; echo "exit=$? (1)"
```

## Tests

15 Unit-Tests, davon 9 gegen veröffentlichte Vektoren (siehe oben) und 6 über die
Eingabefläche: Konstantzeit-Vergleich inklusive Längenunterschied ohne Panik, Hex-Round-Trip,
kaputtes Hex wird abgelehnt statt zu paniken, zwei Zufallsziehungen kollidieren nicht,
Byte-Anzahl außerhalb des Bereichs wird abgelehnt.

## Was noch fehlt

- **Kein AEAD, keine KDF** — siehe oben, bewusst.
- **Kein Benchmark.** Für „schwere Werkzeuge" ist die Leistung nicht gemessen; die
  Prozessgrenze kostet Prozessstart, was bei vielen kleinen Digests relevant werden kann.
- **`random` nutzt `BCryptGenRandom` unter Windows**, aber der Rückgabestatus wird nur gegen
  `0` geprüft; eine feinere NTSTATUS-Auswertung fehlt.
