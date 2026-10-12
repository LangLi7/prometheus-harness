//go:build windows

package supervisor

import "syscall"

// sysProcAttr: Windows kennt keine Prozessgruppen, die man wie unter POSIX per
// Signal erreichen koennte. Ein hartes Beenden trifft deshalb nur das direkte
// Kind (TerminateProcess). Kindprozesse von Kindern bleiben eine offene Luecke
// und stehen so im README.
func sysProcAttr() *syscall.SysProcAttr { return nil }
