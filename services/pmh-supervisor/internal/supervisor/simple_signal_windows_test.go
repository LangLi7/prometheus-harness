//go:build windows

package supervisor

// waitForSignal: Windows kann einem fremden Prozess kein SIGTERM zustellen.
// Der Fake wartet deshalb endlos; der Supervisor greift nach der Frist hart
// durch (TerminateProcess).
func waitForSignal() {
	blockForever()
}
