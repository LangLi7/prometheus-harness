//go:build !windows

package supervisor

import (
	"os"
	"syscall"
)

// gracefulSignal beendet ein Kind freundlich: SIGTERM, damit es aufraeumen
// kann. Auf POSIX-Systemen ist SIGTERM der uebliche Weg; erst danach greift
// die Frist und dann SIGKILL.
func gracefulSignal() os.Signal { return syscall.SIGTERM }
