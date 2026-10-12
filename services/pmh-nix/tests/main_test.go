package tests

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

// binaryPath ist das einmal je Testlauf gebaute Programm pmh-nix. Die
// Kommandozeilentests gehen ueber die Prozessgrenze, weil ein package main
// nicht importierbar ist und weil nur so die Exit-Codes wirklich gemessen
// werden.
var binaryPath string

// TestMain baut das Programm einmal und raeumt danach auf.
func TestMain(m *testing.M) {
	dir, err := os.MkdirTemp("", "pmh-nix-tests-")
	if err != nil {
		panic("Testverzeichnis nicht anlegbar: " + err.Error())
	}
	binaryPath = filepath.Join(dir, "pmh-nix.exe")

	wd, err := os.Getwd()
	if err != nil {
		panic("Arbeitsverzeichnis nicht lesbar: " + err.Error())
	}
	root := filepath.Dir(wd)

	build := exec.Command("go", "build", "-buildvcs=false", "-o", binaryPath, "./cmd/pmh-nix")
	build.Dir = root
	build.Stdout = os.Stderr
	build.Stderr = os.Stderr
	if err := build.Run(); err != nil {
		os.RemoveAll(dir)
		panic("pmh-nix nicht baubar: " + err.Error())
	}

	code := m.Run()
	os.RemoveAll(dir)
	os.Exit(code)
}
