//go:build windows

package supervisor

import "os"

// gracefulSignal: Windows kennt kein SIGTERM. Go liefert fuer os.Interrupt
// einen Fehler ("not supported by windows"), der Prozess wird also nicht
// freundlich beendet. Der Versuch bleibt trotzdem drin, damit die Absicht
// sichtbar ist; nach Ablauf der Frist beendet Shutdown hart (TerminateProcess).
//
// Nicht umgesetzt (siehe README): das Zustellen von CTRL_BREAK an die
// Prozessgruppe des Kindes. Das braucht eine eigene Konsole und ist ohne
// Job-Objekt nicht zuverlaessig.
func gracefulSignal() os.Signal { return os.Interrupt }
