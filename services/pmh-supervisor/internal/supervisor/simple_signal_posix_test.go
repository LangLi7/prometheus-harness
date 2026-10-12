//go:build !windows

package supervisor

import (
	"os"
	"os/signal"
	"syscall"
)

// waitForSignal blockiert, bis das Kind ein Signal bekommt. Nur fuer den
// Test-Fake; der Supervisor selbst nutzt signal.NotifyContext.
func waitForSignal() {
	ch := make(chan os.Signal, 1)
	signal.Notify(ch, syscall.SIGTERM, syscall.SIGINT)
	<-ch
	signal.Stop(ch)
}
