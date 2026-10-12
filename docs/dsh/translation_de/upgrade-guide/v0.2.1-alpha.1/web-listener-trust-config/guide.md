---
kind: upgrade-guide
description: "Das Web-Profil ersetzt den Service `webRuntime` und die Config `trustedHosts` der Zeile `web-runtime` durch `webStartup` und weist einen Wildcard-Listener-Host zurück."
---

# Web-Listener- und Trust-Konfiguration wandert nach `webStartup`

English | [中文](guide.zh.md)

## Änderung

Das Web-Profil stellt den Service `webRuntime` nicht mehr bereit, und die Zeile `web-runtime` deklariert keinen Config-Wert `trustedHosts` mehr. Ein Profil, Overlay oder `--patch`-Datei, das `webRuntime` injiziert, wartet jetzt auf einen Service, der nie mountet, und ein Ausdruck, der `ctx.webRuntime.trustedHosts` liest, lässt sich nicht auswerten, sodass die erforderliche Connection nicht starten kann.

Die Zeile `web-startup` stellt einen Service `webStartup` bereit, der die `--trusted-host`-Autoritäten des Aufrufs trägt, und die Zeile `connection` liest sie aus `ctx.webStartup.trustedHosts`. Der Listener-Host muss außerdem eine konkrete IPv4- oder IPv6-Adresse einer lokalen Schnittstelle sein: `host: 0.0.0.0`, `--host ::` und jede andere nicht spezifizierte Adresse werden beim Laden zurückgewiesen, weil das Binden aller Schnittstellen den Port dem Netzwerk offenlegt.

## Migration

1. `inject: [webRuntime]` durch `inject: [webStartup]` in jeder Zeile ersetzen, die den Trust des Aufrufs benötigt.
2. Ausdrücke `ctx.webRuntime.trustedHosts` durch `ctx.webStartup.trustedHosts` ersetzen und `ctx.webRuntime.lanAddresses` weglassen, was nicht mehr existiert.
3. Das `connection`-Overlay für `webStartup` umschreiben und jeden `trustedHosts`-Wert, den die Zeile `web-runtime` trug, in dessen Ausdruck verschieben. Ein Patch ersetzt die gesamte `config` der getroffenen Zeile, daher diese Config vollständig wiederholen und einen array-wertigen `!!js`-Ausdruck als zitierten Skalar schreiben:

   ```yaml
   # before
   - id: connection
     inject: [webRuntime]
     config:
       trustedHosts: !!js "['app.internal', ...ctx.webRuntime.trustedHosts]"
   # after
   - id: connection
     inject: [webStartup]
     config:
       trustedHosts: !!js "['app.internal', ...ctx.webStartup.trustedHosts]"
   ```

4. Einen Wildcard-`host` durch eine konkrete Adresse einer lokalen Schnittstelle ersetzen. Die Bind-IP selbst wird vom Host-Fence ohne `--trusted-host`-Eintrag akzeptiert; eine Proxy- oder DNS-Autorität braucht weiterhin einen.
5. Mit dem migrierten Overlay booten: `dsh --profile web --patch ./extra.yml --no-open` muss die URL-Zeile `dsh web:` ausgeben und ausliefern. Eine Zeile, die weiterhin auf `webRuntime` wartet, lässt die erforderliche Connection ausstehend und meldet einen Aktivierungsfehler, und ein zurückgewiesener `host` schlägt beim Laden fehl. `dsh --profile web --patch ./extra.yml --dump-config` gibt den zusammengesetzten Patch vor dem Boot aus. [Das README des Web-Bundles](../../../../packages/bundle/web-app/README.md) besitzt die zusammengesetzten Zeilen.
