# Prometheus Tray — Build-Ablage, **nicht** von hier starten

> **Wichtig:** Dieser Ordner liegt im DSH-Workspace. Windows hat den Workspace
> mit `Low Mandatory Level` gelabelt. Eine `.exe`, die von hier gestartet wird,
> läuft deshalb mit **niedriger Integrität**; `Shell_NotifyIconW` wird dann von
> der Medium-Integritäts-Taskleiste mit **Fehler 5 (Zugriff verweigert)**
> abgewiesen. Es erscheint kein Symbol.
>
> Der Workaround ist keine Einstellung, sondern ein anderer Speicherort: Die
> installierte Fassung liegt außerhalb des Workspace in
> **`C:\Users\Chang\AppData\Local\PrometheusTray`** und funktioniert dort mit
> normaler Integrität.

## Starten

- **Desktop:** `Prometheus Tray.lnk`
- **Installationsordner:** `C:\Users\Chang\AppData\Local\PrometheusTray\Prometheus Tray.lnk`
- **Projektordner:** `Prometheus Tray.lnk` (zeigt ebenfalls auf die installierte Fassung)

Die Verknüpfung setzt das Arbeitsverzeichnis auf
`C:\Users\Chang\prometheus-harness`. Die `.exe` in **diesem** Ordner nicht
doppelklicken — sie ist nur die Build-Ablage und scheitert an der Integrität.

## Bedienung, Autostart und Diagnose

Die vollständige Anleitung liegt bei der installierten Fassung:

```text
C:\Users\Chang\AppData\Local\PrometheusTray\README.md
```

Kurz: Rechtsklick auf den farbigen Punkt → **Starten**. Grau = gestoppt,
gelb = startet, grün = läuft. **Im Browser oeffnen** enthält den Token.

## Neu bauen und installieren

```powershell
cargo build --release -p pmh-tray
powershell -ExecutionPolicy Bypass -File native\pmh-tray\install.ps1
```

Das Installationsskript kopiert beide Binaries in den normalen Benutzerordner
und legt die Verknüpfungen neu an. Es braucht keine Administratorrechte.
