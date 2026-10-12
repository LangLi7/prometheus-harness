---
kind: upgrade-guide
description: "Mitgelieferte NumPy- und pandas-Distributionen lassen ihre Upstream-Testsuiten weg."
---

# Upstream-Tests von NumPy und pandas erfordern eine separate Umgebung

English | [中文](guide.zh.md)

## Änderung

Desktop- und Python-SDK-Runtime-Distributionen enthielten zuvor die Testverzeichnisse von NumPy und pandas. Mitgelieferte Distributionen lassen diese Verzeichnisse nun weg, sodass Skripte, die deren Testmodule importieren oder deren vollständige Upstream-Suiten ausführen, eine separate Installation benötigen. Datenverarbeitung, Office-Erstellung, `numpy.testing`, `pandas.testing` und `pandas._testing` bleiben verfügbar.

## Migration

1. Wenn Skripte `numpy.*.tests` oder `pandas.tests` importieren, die ursprünglichen NumPy- und pandas-Distributionen samt ihrer Upstream-Testabhängigkeiten in einer separaten Python-Umgebung installieren. Diese Umgebung außerhalb des verwalteten Harness-Runtime-Verzeichnisses halten, das Upgrades ersetzen.
2. Die betroffenen Skripte oder Upstream-Suiten mit dem Interpreter dieser Umgebung ausführen. Skripte, die nur Bibliotheksfunktionalität oder beibehaltene Test-Helper verwenden, benötigen keine Änderungen.
3. Bestätigen, dass die zuvor fehlschlagenden Testmodul-Importe und die betroffenen Skripte mit dem separaten Interpreter erfolgreich sind. Die mitgelieferten Versionen sind im [runtime lock](../../../../scripts/primary-runtime/lock.json) festgehalten.
