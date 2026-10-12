# Cordis-Primer

English | [中文](cordis-primer.zh.md)

Cordis ist das vendored Plugin-Framework unterhalb von DeepSeek Harness. Dieser Primer vermittelt die Cordis-Ideen, die ein Harness-Plugin-Autor benötigt, bevor er die generierte Service-/Event-Referenz auf den [Subsystem-Seiten](subsystems/core.md) liest; das [Cordis-Tutorial](cordis-tutorial/index.md) führt durch dieselben Ideen in der Praxis. Der vendored Quellcode und das Sync-Verfahren stehen in [vendor/README.md](../vendor/README.md).

## Cordis in fünf Ideen

- **Ein Plugin ist ein Objekt, das Service implementiert.** Es kann eine Funktion mit optionalen Feldern `inject` und `apply(ctx)` sein oder eine `Service`-Unterklasse, deren Lifecycle Cordis in den aktuellen Context einhängt.
- **Ein Context ist ein Repository von Services.** Ein Service beansprucht einen stabilen Schlüssel `ctx.<key>` wie `ctx.tools`, `ctx.llm` oder `ctx.sessions` aus einem Context; andere Plugins finden Services über den Schlüssel statt durch den Import einer konkreten Implementierung.
- **Service-Abhängigkeit über `inject` deklarieren.** Ein Plugin, das erforderliche Services benennt, wartet, bis diese Services existieren; die Ladereihenfolge drückt sich damit über Service-Anforderungen aus statt über manuelle Boot-Sequenzierung.
- **Typisierte Events für die Kommunikation.** Services deklarieren Event-Namen über TypeScript-Declaration-Merging und dispatchen sie dann als `emit`, `waterfall`, `parallel`, `serial` oder `bail` — je nachdem, ob Listener beobachten, umhüllen, auffächern, der Reihe nach laufen oder beim ersten Bail-Wert stoppen.
- **Registrierungen sind umkehrbare Effects.** Prompt-Abschnitte, Tool-Schemas, Adapter, Provider und Listener werden über `ctx.effect()` oder `ctx.on()` installiert, sodass Reload und Teardown sie vorhersehbar zurückrollen.

## Dispatch-Modi

Jedes Event kann einen der folgenden Dispatch-Modi haben und kann dementsprechend nur über diese Methoden dispatcht werden.

| Modus | Wartet? | Dispatch-Reihenfolge | Hat Rückgabewert? |
|---|---|---|---|
| `emit` | Nein | Listener beobachten in Registrierungsreihenfolge | Nein |
| `waterfall` | Nein | Listener beobachten in Registrierungsreihenfolge | Ja |
| `parallel` | Ja | alle Listener beobachten das Event parallel | Nein |
| `serial` | Ja | Listener beobachten in Registrierungsreihenfolge | Ja |
| `bail` | Nein | Listener beobachten in Registrierungsreihenfolge, bis einer bailt | Ja |

Der Dispatch-Modus ist Teil des öffentlichen Vertrags des Events. Neue Harness-Events dokumentieren ihn mit einem `@mode`-Tag, damit der generierte Katalog Deklarationen gegen Dispatch-Stellen prüfen kann.

## Cordis-Waterfall-Semantik

`ctx.waterfall` ist Around-Middleware. Ein Listener erhält `(...args, next)`. `next()` aufrufen, um das möglicherweise umhüllte Ergebnis an den nächsten Service zu delegieren; ohne `next()` zurückkehren, um kurzszuschließen. Werte propagieren über den Rückgabewert von `next()`.

Kooperative Listener verändern üblicherweise ein gemeinsames Request- oder Decision-Objekt und delegieren danach. Ein Listener kann auch das Ergebnis vollständig ersetzen; nachgelagerte Listener sehen dann nur das Ergebnis nach der Ersetzung. `prepend: true` nur verwenden, wenn der Listener vor gewöhnlichen Registrierungen laufen muss.

Bei Events mit einer einzigen Entscheidung ist das Kurzschließen das Design. Ein Policy-Listener kann ohne `next()` zurückkehren, wenn er die Entscheidung besitzt, während ein Listener, der nur annotiert oder beobachtet, delegieren muss.

## Loader-Konfiguration

`@deepseek-ai/cordis-plugin-include` parst `!!js` in Expression-Knoten. Der Loader interpoliert das `config` eines Eintrags (nachdem deklarierte Injections aktiviert sind, gegen diesen Plugin-Context — `ctx.serviceName`) und dessen Feld `disabled` (bei jeder Mount-Entscheidung, gegen den Loader-Context); Include bewahrt verschachtelte Row-Expressions bis zur Aktivierung des Ziels. Andere Eintrags-Metadaten bleiben literal. Overlays verwenden, wenn die Umgebung die Plugins auswählt.

## Praktische Regeln

Verhalten in Plugins kapseln: ein Tool-Pipeline-Event gehört zu `ctx.tools`, Model-Streaming gehört zu `ctx.llm` und die Live-Agent-Koordination gehört zu `ctx.agents`. Für Abfangen und Policy Events bevorzugen; für direkte Capability-Aufrufe Service-Methoden bevorzugen.

Jede Registrierung sollte einen Disposer haben — entweder durch Rückgabe eines solchen aus `ctx.effect()` oder über einen Cordis-Helper, der das übernimmt. Wenn die Teardown-Reihenfolge zählt, die zusammengehörige Arbeit in einem Effect halten, damit die Disposal in der beabsichtigten Abfolge zurückrollt.
