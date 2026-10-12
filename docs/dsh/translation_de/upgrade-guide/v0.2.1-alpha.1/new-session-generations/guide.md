---
kind: upgrade-guide
description: "New Session erzeugt einen frischen Agent, statt eine bestehende leere Session wiederzuverwenden."
---

# Mit New Session einen frischen Agent starten

English | [中文](guide.zh.md)

## Änderung

In Web und Desktop erzeugt New Session eine frische Session und einen frischen Agent anhand der aktuellen Preset-Definition. Zuvor wurde eine bestehende leere Session im Workspace wiederverwendet, die eine frühere Preset-Definition behalten konnte.

Client-Aufrufe von `uiWorkspace.startSession(workspaceId)` folgen demselben Verhalten. Das erneute Verbinden eines Workspace über `openWorkspace` oder `connectWorkspace` verwendet weiterhin eine geeignete leere Session wieder. Aufrufe mit Draft-Vorbereitungsoptionen behalten ihre bestehenden Wiederverwendungs- und Inhaltsregeln. Bestehende Agents behalten ihre Preset-Komposition; globale optionale Tools aktualisieren sich bei ihrer nächsten Anfrage, wenn ein Bundle umgeschaltet wird.

## Migration

1. Nach dem Ändern einer Preset-Definition New Session verwenden, um einen Agent mit der aktuellen Definition zu erzeugen. In einer bestehenden Session weiterarbeiten, wenn deren beibehaltene Preset-Komposition beabsichtigt ist.
2. Client-Integrationen, die einen Workspace erneut verbinden, sollten `openWorkspace` oder `connectWorkspace` verwenden. Explizite Draft-Vorbereitungsoptionen beibehalten, wenn ein bestehender Entwurf vorbereitet wird.
3. Bestätigen, dass der neue Agent die aktualisierte Preset-Definition verwendet; keine persistierten Session-Dateien oder Profil-Patches müssen umgeschrieben werden.
