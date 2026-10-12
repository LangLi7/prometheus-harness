---
kind: upgrade-guide
description: "SSH- und Node-PTC-Konfigurationen verwenden explizite Startmodi, und SSH-Clients erfordern einen passenden Protokoll-2-Helper."
---

# Startkonfiguration für SSH-Helper und PTC

English | [中文](guide.zh.md)

## Änderung

Eigene SSH-Kompositionen müssen ihre `cordis.yml` und den installierten Helper gemeinsam aktualisieren. `dsh-ssh` ersetzt die Felder auf oberster Ebene `node`, `bootstrapPath` und `bootstrapHash` durch `launch` und erfordert SSH-Protokoll 2. `dsh-ptc-runtime-node` ersetzt `nodeExecutable` und `bootstrapPath` durch `launch`. Die Getter `nodeExecutable` und `bootstrapPath` der Verbindung werden durch `ptcLaunch` ersetzt.

## Migration

1. Bei einem Skript-Helper `node`, `bootstrapPath` und `bootstrapHash` unter `launch: { kind: node-script }` verschieben. `helper`, `helperHash`, `host` und `workspace` an ihren bestehenden Stellen behalten. Das passende Helper-Skript installieren und `helperHash` aktualisieren; Bootstrap und seinen Hash gemeinsam aktualisieren, wenn er konfiguriert ist.
2. Bei einem paketierten Helper das vollständige Archiv entpacken und `launch: { kind: executable }` setzen, `helper` auf den absoluten entfernten Pfad der ausführbaren Datei und `helperHash` auf deren Digest aus `manifest.json`.
3. Den entfernten PTC-Provider mit `launch: ctx.ssh.ptcLaunch` in der bestehenden JavaScript-Konfiguration der Komposition konfigurieren. Für einen explizit konfigurierten lokalen Node-Worker `launch: { kind: 'node-script', executable: previousNodeExecutable, bootstrapPath: previousBootstrapPath }` verwenden. Eine weggelassene lokale Startkonfiguration wählt weiterhin die Runtime des aktuellen Prozesses.
4. Das konfigurierte Profil starten und einen entfernten Dateilesevorgang, einen Prozessbefehl und einen PTC-Aufruf durchspielen. Eine Abweichung bei Protokoll oder Digest erfordert die gemeinsame Aktualisierung des installierten Helpers und seiner Konfiguration. Siehe die [SSH-Deployment-Anforderungen](../../../../packages/ssh/ssh/README.md#use-this-package).
