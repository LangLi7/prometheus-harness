/**
 * **Wie man hereinkommt und wie man hinauskommt — ohne Adreßzeile.**
 *
 * **Warum das geprueft wird.** Hier haengen zwei Aussagen, die der Betreiber mit **Bildern** gemeldet
 * hat:
 *
 *   1. **„wer den Umschalter drueckt, will die Welt sehen"** — nicht die Ansicht, die in diesem
 *      Browser zuletzt eingestellt war. Stand dort `chat`, kam er im **Platzhalter-Chat** des
 *      Prototyps heraus (Bild vom 14.10.2026). Das ist der **Ankunftswunsch** (`takeArrival`).
 *   2. **„die Marke fuehrt zwischen Harness und Welt"** — mit Herkunft wird **navigiert**, ohne
 *      Herkunft **umgeblendet** (`markeZiel`). Wer beides gleich behandelt, blendet beim Verlassen
 *      zusaetzlich auf den Platzhalter um.
 *
 * **Was hier nicht mehr steht — und warum.** Frueher wurde beides ueber die **Adresse** geloest
 * (`?ansicht=os`, `?chat=<fremde Adresse>`), und diese Datei prueft entsprechend `istChatAdresse`
 * gegen `javascript:` und `//boese.example`. Seit Chat und Welt auf **einem** Port liegen
 * (`docs/status/welt-ein-port.md`), gibt es keine fremde Adresse mehr: die Herkunft steht in
 * `location.origin`, und der Wunsch liegt im `localStorage` derselben Herkunft. Der Betreiber:
 * *„der link ist nur zu lange so lol"*. **Die Pruefung auf fremde Adressen ist damit nicht
 * verschwunden, sondern gegenstandslos** — der Wert, der an `location.assign` geht, ist die eigene
 * Herkunft, und die kann niemand von aussen unterschieben.
 */
import { expect, test } from 'bun:test'
import { ARRIVAL_KEY, ARRIVAL_VALUE, chatUrl, inselChatTextKey, markeTextKey, markeZiel, takeArrival, waehleAnsicht } from '../src/entry'

/**
 * Ein Speicher zum Anfassen.
 *
 * **Ein eigener, nicht der des Stubs.** Der Ankunftswunsch wird beim Lesen **weggenommen** — das
 * laesst sich mit einem Speicher, der immer `null` gibt, nicht pruefen. Ein Test, der nichts pruefen
 * kann, ist schlimmer als keiner.
 */
function speicherMit(inhalt: Record<string, string> = {}): {
  readonly faecher: Map<string, string>
  readonly speicher: { getItem: (s: string) => string | null; removeItem: (s: string) => void }
} {
  const faecher = new Map<string, string>(Object.entries(inhalt))
  return {
    faecher,
    speicher: {
      getItem: (s: string) => faecher.get(s) ?? null,
      removeItem: (s: string) => {
        faecher.delete(s)
      },
    },
  }
}

test('der Ankunftswunsch wird gelesen — und dabei VERBRAUCHT', () => {
  const { faecher, speicher } = speicherMit({ [ARRIVAL_KEY]: ARRIVAL_VALUE })
  expect(takeArrival(speicher)).toBe('os')
  // **Einmalig, und das ist der Kern.** Blieb der Wunsch stehen, saehe jeder spaetere Aufruf der Welt
  // wie ein vergessener Klick aus: wer die Welt auf die Chat-Ansicht stellt und neu laedt, bekaeme
  // wieder das Universum.
  expect(faecher.has(ARRIVAL_KEY)).toBe(false)
  expect(takeArrival(speicher)).toBeUndefined()
})

test('was nicht der vereinbarte Wert ist, fuehrt zu keiner Ansicht', () => {
  // Im Speicher kann ein Wert aus einer aelteren Fassung liegen — oder von Hand geschrieben sein.
  for (const unsinn of ['universum', '', 'OS', 'chat']) {
    const { faecher, speicher } = speicherMit({ [ARRIVAL_KEY]: unsinn })
    expect(takeArrival(speicher)).toBeUndefined()
    // **Auch der Unsinn wird weggenommen.** Sonst laege er beim naechsten Start wieder da.
    expect(faecher.has(ARRIVAL_KEY)).toBe(false)
  }
})

test('ohne Speicher und ohne Eintrag geschieht nichts', () => {
  expect(takeArrival(undefined)).toBeUndefined()
  expect(takeArrival(speicherMit().speicher)).toBeUndefined()
})

test('ein gesperrter Speicher ist kein Grund, den Start scheitern zu lassen', () => {
  // Manche Browser verbieten den Zugriff (strenger Datenschutzmodus). Dann gilt die gespeicherte
  // Einstellung — aber die Welt muss erscheinen.
  const gesperrt = {
    getItem: () => {
      throw new Error('gesperrt')
    },
    removeItem: () => {
      throw new Error('gesperrt')
    },
  }
  expect(takeArrival(gesperrt)).toBeUndefined()
})

test('DER Ankunftswunsch schlaegt die gespeicherte Einstellung', () => {
  // **Der Kern der Aenderung.** Stand im Browser `chat` (der Platzhalter!), muss der Umschalter
  // trotzdem die Welt zeigen — sonst sieht der Benutzer genau das Bild, das der Betreiber gemeldet
  // hat.
  expect(waehleAnsicht('os', 'chat')).toBe('os')
  expect(waehleAnsicht('chat', 'web')).toBe('chat')
  // Ohne Wunsch gilt die Einstellung — und `web` wird **nicht** mehr stillschweigend zu `os`.
  expect(waehleAnsicht(undefined, 'web')).toBe('web')
  expect(waehleAnsicht(undefined, 'chat')).toBe('chat')
  expect(waehleAnsicht(undefined, 'os')).toBe('os')
  // Unsinn im Speicher faellt auf die Welt zurueck — der Vorgabewert, nie eine Ausnahme.
  expect(waehleAnsicht(undefined, 'universum')).toBe('os')
  expect(waehleAnsicht(undefined, undefined)).toBe('os')
})

test('der Weg zurueck in den Chat ist die Wurzel der EIGENEN Herkunft', () => {
  expect(chatUrl('http://127.0.0.1:3081')).toBe('http://127.0.0.1:3081')
  // **Der Schlussstrich ist weg**: zwei Schreibweisen derselben Seite sind zwei Zeichenketten, und
  // die Beschriftung der Marke nennt die Adresse. Eine Form, nicht zwei.
  expect(chatUrl('http://127.0.0.1:3081/')).toBe('http://127.0.0.1:3081')
  expect(chatUrl('http://127.0.0.1:3081///')).toBe('http://127.0.0.1:3081')
  expect(chatUrl('https://beispiel.example')).toBe('https://beispiel.example')
  // **Und wo es keinen Chat gibt.** Ein `file://`-Dokument hat `origin === 'null'` — das ist der
  // Text „null", keine Herkunft. Wer ihn durchreicht, baut die Adresse `null` und navigiert ins Leere.
  expect(chatUrl('null')).toBeUndefined()
  expect(chatUrl('')).toBeUndefined()
  expect(chatUrl(undefined)).toBeUndefined()
})

test('die Marke navigiert — oder blendet um: zwei Handlungen, nicht eine', () => {
  // **Der Kern des gemeldeten Fehlers.** Mit Adresse wird **navigiert** (die Welt wird verlassen),
  // ohne Adresse wird **umgeblendet** (die Welt bleibt, nur die Ansicht wechselt).
  expect(markeZiel('http://127.0.0.1:3081')).toEqual({ art: 'ort', adresse: 'http://127.0.0.1:3081' })
  expect(markeZiel(undefined)).toEqual({ art: 'ansicht', ansicht: 'chat' })
  // Und die Adresse kommt **durch dieselbe Pruefung** wie oben — `file://` ist kein Ort.
  expect(markeZiel('null')).toEqual({ art: 'ansicht', ansicht: 'chat' })
})

test('die Beschriftung sagt, WELCHER Chat gemeint ist', () => {
  // Zwei Dinge heissen „Chat": der Harness-Chat und der Platzhalter dieses Prototyps. Eine
  // Beschriftung, die beide gleich nennt, ist die Verwechslung selbst.
  expect(markeTextKey('http://127.0.0.1:3081')).toBe('hud.toHarness')
  expect(markeTextKey(undefined)).toBe('hud.toChat')
  // **Und der Eintrag der Insel sagt dasselbe** — der Betreiber hat ausdruecklich verlangt, dass die
  // neue Verknuepfung auch dort gilt (Gruppe „Ansichten"): zwei Wege mit demselben Namen muessen
  // dasselbe tun.
  expect(inselChatTextKey('http://127.0.0.1:3081')).toBe('island.action.harness')
  expect(inselChatTextKey(undefined)).toBe('island.action.chat')
})
