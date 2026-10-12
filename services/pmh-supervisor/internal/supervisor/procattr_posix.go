//go:build !windows

package supervisor

import "syscall"

// sysProcAttr setzt fuer das Kind eine eigene Prozessgruppe. Damit trifft ein
// hartes Beenden die ganze Gruppe und nicht nur das direkte Kind.
func sysProcAttr() *syscall.SysProcAttr {
	return &syscall.SysProcAttr{Setpgid: true}
}
