---
kind: upgrade-guide
description: "Python-Runtime-Wheels erfordern explizite Downloads für Office-Konvertierung und mitgelieferte Autoring-Umgebungen."
---

# Optionale Python-Runtime-Ressourcen explizit herunterladen

English | [中文](guide.zh.md)

## Änderung

Python-Runtime-Wheels lassen den Office-Sidecar sowie Autoring-Interpreter und -Bibliotheken weg. Der SDK-Start lädt sie nicht herunter. Office-Operationen erfordern einen expliziten Download; die Autoring-Umgebung und die Konvertierungs-Engine können unabhängig ausgewählt werden. Das SDK paketiert weiterhin die normale `dsh`-CLI und erfordert kein System-Node.js.

## Migration

1. Vor der Verarbeitung von Office-Dateien `deepseek_harness_runtime.download_office()` aufrufen. Vor der Verwendung der mitgelieferten Autoring-Umgebung `deepseek_harness_runtime.download_primary_runtime()` aufrufen. Beide verwenden abgeschlossene Caches wieder und geben absolute Pfade zurück.
2. Für den Offline-Betrieb den Cache mit dem passenden Runtime-Release auf der Zielplattform vorbereiten und ihn in den Deployment-Bereich dieser Plattform kopieren. `DSH_RESOURCE_CACHE` vor Downloads und SDK-Start auf dessen absolutes Wurzelverzeichnis setzen. Siehe die [Runtime-Referenz](../../../../python/sdk-runtime/README.md).
3. Das SDK starten und bestätigen, dass die erforderlichen Ressourcen verfügbar sind. `deepseek_harness_runtime.resolve_office_launch_args()` prüft die Office-CLI-Pfade, ohne herunterzuladen. Bestehende `DSH_PRIMARY_RUNTIME`-Pfade bleiben unterstützt; ein leerer Wert deaktiviert die Autoring-Abfrage. Profil-Patches können `skill-office` unabhängig deaktivieren.
