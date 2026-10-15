# Fähigkeiten und Anbieter — Modelle, die nicht nur reden

Stand: 15.10.2026. **Entwurf**, noch nicht gebaut. Aufgeschrieben, damit der Gedanke nicht
verlorengeht — der Betreiber will ihn „später".

## Worum es geht

Heute kennt unsere Anwendung **ein** Modellart: das **Gesprächsmodell** (Chat). Der Betreiber
will mehr — nicht als Sonderfälle, sondern als **Schnittstellen**, die ein Paket füllen kann:

| Fähigkeit | Beispiel | Art der Antwort |
|---|---|---|
| `entscheiden` | `~typesafe/jev-latest`, lokal `Tev1-4B` | eine **typisierte Beurteilung**, kein Fließtext |
| `text-zu-sprache` | Gemini TTS, TTS-lite | Audio |
| `sprache-zu-text` | **gibt es schon** (Whisper, NeMo, SenseVoice) | Text |
| `einbetten` | Gemini Embedding | Vektor |
| `bild` | „nano-banana" | Bild |

Die erste Zeile ist die eigentlich neue: ein **Entscheidungsmodell** beantwortet keine Frage mit
Satz, sondern mit einem **Urteil** — „ja/nein", eine Wahrscheinlichkeit, eine Auswahl. Das ist
eine andere Schnittstelle als Chat, nicht ein anderes Modell derselben.

## Was es im Haus schon gibt (gemessen)

Kein Neubau nötig — die Bausteine liegen da:

| Baustein | Was er liefert |
|---|---|
| `packages/llm/llm-deepseek-account`, `llm-deepseek-api-key`, `llm-pi-ai` | **ein Paket je Anbieter** — genau die Form für `llm-openrouter` |
| `packages/experimental/api-speech-to-text`, `speech-*` | eine **Fähigkeit als eigener Namensraum** — das Muster für die anderen |
| `packages/auth/secrets` + Tabelle `user_secrets` | **Umschlagverschlüsselung** für Schlüssel: `value_cipher`, `wrapped_key`, Hauptschlüssel. Schlüssel haben also schon einen Ort |
| `dsh-client-ui-settings-models` (`CustomProviderCard`, `apiKey.ts`) | die Oberfläche für **Anbieter + Schlüssel** — mit Feldprüfung im Browser |
| `dsh-experimental-client-ui-voice-input` | eine Karte „installieren, einschalten, benutzen" — das Vorbild für jede weitere Fähigkeit |
| `packages/llm/token-meter` | Verbrauch messen — gilt für jede Fähigkeit |

## Der Vorschlag

**Drei Wörter, klar getrennt** — das beantwortet auch die Frage „Plugin, Extension oder Package?":

| Wort | Bedeutung |
|---|---|
| **Paket** | die Einheit im Quelltext (`packages/…`) — was ein Mensch schreibt |
| **Plugin** | wie der Rechner es lädt (`dsh.client`, `inject`, `apply`) — nichts Neues |
| **Fähigkeit** | die **Schnittstelle** (was kann etwas?) — z. B. `entscheiden` |
| **Anbieter** | die **Umsetzung** einer Fähigkeit — z. B. OpenRouter, Tev1 lokal |

Eine Fähigkeit ist ein Vertrag; ein Anbieter erfüllt ihn. Ein Paket darf **mehrere** Fähigkeiten
anbieten, wenn sein Dienst sie wirklich kann.

**Ein Schlüssel, viele Fähigkeiten.** OpenRouter bedient Chat, TTS, Transkription, Einbetten und
Bild über **einen** Schlüssel. Deshalb gehört der Schlüssel zum **Anbieter**, nicht zur Fähigkeit
— sonst müßte der Nutzer sechsmal dasselbe eintragen. Die Zuordnung
*Fähigkeit → Modellkennung* ist **Einstellung**, kein Schlüssel:

```
Anbieter: openrouter        Schlüssel: sk-or-…        (einmal, verschlüsselt in user_secrets)
  entscheiden      -> ~typesafe/jev-latest
  text-zu-sprache  -> google/gemini-3.8-flash-tts
  sprache-zu-text  -> google/gemini-3.5-transcribe
  einbetten        -> google/gemini-embedding-2
  bild             -> google/gemini-nano-banana-2.1

Anbieter: tev-lokal         Schlüssel: keiner          (läuft auf diesem Rechner)
  entscheiden      -> togethercomputer/Tev1-4B-experimental
```

**Jede Fähigkeit hat ihre eigene Form.** Das ist der Kern: `entscheiden` bekommt **Eingabe +
Schema** und gibt ein **Urteil** zurück; `text-zu-sprache` bekommt Text und gibt Bytes;
`einbetten` gibt einen Vektor fester Länge. Ein gemeinsamer „ruf-ein-Modell"-Weg würde diese
Unterschiede verwischen — und dann rät der Aufrufer, was zurückkommt.

**Kein Schlüssel im Browser.** Der Schlüssel wird **einmal** eingetippt (wie im
Modelle-Bildschirm des Kerns), liegt verschlüsselt in `user_secrets` und wird **nur** auf dem
Rechner benutzt. Die Oberfläche sieht ihn danach nie wieder — sie sieht „gesetzt" oder „nicht
gesetzt".

**Und der Nachweis gehört dazu.** Für jede Fähigkeit: ein Aufruf gegen den echten Anbieter, die
Antwort **in der Form des Vertrags**, und eine Gegenprobe mit **falschem Schlüssel** (die
muß sauber abgelehnt werden, nicht halb durchlaufen).

## Was ich zuerst bauen würde

1. **`entscheiden`** — weil es die einzige Fähigkeit ist, die es **nirgends** gibt (Chat und
   Sprache-zu-Text existieren). Und weil ein Urteil mit Schema der interessanteste Fall ist.
2. **Den Anbieter `openrouter`** — ein Schlüssel, mehrere Fähigkeiten; damit ist die
   Schlüssel-Schnittstelle einmal richtig gebaut.
3. **`text-zu-sprache`** — die zweite Hälfte der Sprache, die heute ganz fehlt.

## Offene Fragen (an den Betreiber)

1. **Wer darf Fähigkeiten benutzen?** Ein Schlüssel gehört einem Konto — und ein Aufruf kostet
   Geld. Also: je Konto, mit Obergrenze (`token-meter`)? Oder je Arbeitsbereich?
2. **Was passiert ohne Schlüssel?** Der Anbieter ist da, aber nicht eingerichtet: Fehler,
   Rückfall auf einen anderen Anbieter, oder stiller Rückfall auf „nein"? (Mein Vorschlag:
   **lauter Fehler** — ein stiller Rückfall auf ein Urteil, das niemand gefällt hat, wäre der
   schlimmste Fall.)
3. **Dürfen Fähigkeiten aus dem Netz geholt werden** (Modelle automatisch herunterladen wie bei
   den Sprachmodellen), oder nur, was schon da ist?
