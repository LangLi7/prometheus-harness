// Package state haelt die Buchfuehrung des Dienstes pmh-nix: Vorschlaege samt
// aufgezeichnetem Pruefergebnis, Generationen und die aktive Generation.
//
// Die Buchfuehrung ist die einzige Wahrheit der Politik. Ein Aufrufer kann in
// seiner Anfrage behaupten, was er will — die Politik liest ausschliesslich
// das, was hier aufgezeichnet wurde.
//
// Ablage: eine JSON-Datei unter $PMH_HOME/state/pmh-nix.json, ersatzweise
// ~/.pmh/state/pmh-nix.json. Geschrieben wird atomar (temporaere Datei plus
// Umbenennen), damit ein Abbruch nie eine halbe Datei hinterlaesst.
package state

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/LangLi7/prometheus-harness/services/pmh-nix/api"
)

// Schema ist die Fassung der Ablagedatei.
//
// Fassung 2 ergaenzt die ausdrueckliche Freigabe (Approval), die Basisgeneration
// und die Sachkategorien eines Vorschlags.
const Schema = 2

// Parameter des atomaren Schreibens. Unter Windows sperrt ein gleichzeitiger
// Leser die Zieldatei kurzzeitig; deshalb wird das Umbenennen wiederholt.
const (
	renameAttempts = 50
	renameBackoff  = 10 * time.Millisecond
	isWindows      = runtime.GOOS == "windows"
)

// DefaultDirName ist der Ordnername unterhalb von PMH_HOME bzw. des
// Benutzerverzeichnisses.
const DefaultDirName = ".pmh"

// ProposalRecord ist ein aufgenommener Vorschlag samt seiner Aufzeichnungen.
type ProposalRecord struct {
	Proposal api.Proposal `json:"proposal"`
	Diff     api.Diff     `json:"diff"`
	// Checked ist nil, solange der Vorschlag nicht geprueft wurde. Apply
	// verlangt eine Aufzeichnung.
	Checked *api.CheckRecord `json:"checked,omitempty"`
	// Approval ist nil, solange keine ausdrueckliche menschliche Freigabe
	// vorliegt. Apply verlangt eine Aufzeichnung.
	Approval *api.Approval `json:"approval,omitempty"`
	// BaseGeneration ist die Generation, die beim Aufnehmen aktiv war. Sie ist
	// die Grundlage der Freigabe und der Anwendung.
	BaseGeneration string `json:"base_generation,omitempty"`
	// Applied ist wahr, sobald der Vorschlag eine Generation erzeugt hat.
	// Ein zweites Apply wird abgewiesen.
	Applied       bool   `json:"applied"`
	AppliedAt     string `json:"applied_at,omitempty"`
	GenerationID  string `json:"generation_id,omitempty"`
	BlockedReason string `json:"blocked_reason,omitempty"`
}

// File ist der Inhalt der Ablagedatei.
type File struct {
	Schema      int                        `json:"schema"`
	Seq         int                        `json:"seq"`
	Current     string                     `json:"current"`
	Proposals   map[string]*ProposalRecord `json:"proposals"`
	Generations []api.Generation           `json:"generations"`
}

// Store ist die geladene Buchfuehrung mit ihrem Ablageort.
type Store struct {
	path string
	file File
}

// DefaultPath liefert den Ablageort: $PMH_HOME/state/pmh-nix.json, sonst
// ~/.pmh/state/pmh-nix.json.
func DefaultPath() (string, error) {
	if home := os.Getenv("PMH_HOME"); home != "" {
		return filepath.Join(home, "state", "pmh-nix.json"), nil
	}
	user, err := os.UserHomeDir()
	if err != nil {
		return "", fmt.Errorf("kein PMH_HOME und kein Benutzerverzeichnis: %w", err)
	}
	return filepath.Join(user, DefaultDirName, "state", "pmh-nix.json"), nil
}

// Open laedt die Buchfuehrung. Eine fehlende Datei ist kein Fehler: sie wird
// erst beim ersten Schreiben angelegt.
func Open(path string) (*Store, error) {
	if path == "" {
		var err error
		if path, err = DefaultPath(); err != nil {
			return nil, err
		}
	}
	s := &Store{path: path, file: File{
		Schema:    Schema,
		Proposals: map[string]*ProposalRecord{},
	}}
	raw, err := os.ReadFile(path)
	switch {
	case err == nil:
		if err := json.Unmarshal(raw, &s.file); err != nil {
			return nil, fmt.Errorf("Ablage %s unlesbar: %w", path, err)
		}
		if s.file.Schema != Schema {
			return nil, fmt.Errorf("Ablage %s hat Fassung %d, erwartet %d",
				path, s.file.Schema, Schema)
		}
		if s.file.Proposals == nil {
			s.file.Proposals = map[string]*ProposalRecord{}
		}
	case os.IsNotExist(err):
		// Erster Lauf: leere Buchfuehrung.
	default:
		return nil, fmt.Errorf("Ablage %s nicht lesbar: %w", path, err)
	}
	return s, nil
}

// Path nennt den Ablageort.
func (s *Store) Path() string { return s.path }

// Save schreibt die Buchfuehrung atomar: erst in eine temporaere Datei im
// Zielordner, dann Umbenennen. Der Zielordner wird bei Bedarf angelegt.
func (s *Store) Save() error {
	dir := filepath.Dir(s.path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("Ablageordner %s nicht anlegbar: %w", dir, err)
	}
	s.file.Schema = Schema
	raw, err := json.MarshalIndent(s.file, "", "  ")
	if err != nil {
		return fmt.Errorf("Buchfuehrung nicht serialisierbar: %w", err)
	}
	tmp, err := os.CreateTemp(dir, ".pmh-nix-*.tmp")
	if err != nil {
		return fmt.Errorf("temporaere Datei in %s nicht anlegbar: %w", dir, err)
	}
	tmpName := tmp.Name()
	if _, err := tmp.Write(raw); err != nil {
		tmp.Close()
		os.Remove(tmpName)
		return fmt.Errorf("temporaere Datei %s nicht schreibbar: %w", tmpName, err)
	}
	if err := tmp.Sync(); err != nil {
		tmp.Close()
		os.Remove(tmpName)
		return fmt.Errorf("temporaere Datei %s nicht synchronisierbar: %w", tmpName, err)
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmpName)
		return fmt.Errorf("temporaere Datei %s nicht schliessbar: %w", tmpName, err)
	}
	// Unter Windows kann ein gleichzeitiger Leser das Umbenennen kurzzeitig
	// sperren (Access is denied). Ein paar Versuche mit kurzer Pause loesen
	// das, ohne die atomare Schreibweise aufzugeben.
	var renameErr error
	for attempt := 0; attempt < renameAttempts; attempt++ {
		if renameErr = os.Rename(tmpName, s.path); renameErr == nil {
			break
		}
		if !isRetryableRename(renameErr) {
			break
		}
		time.Sleep(renameBackoff)
	}
	if renameErr != nil {
		os.Remove(tmpName)
		return fmt.Errorf("Ablage %s nicht umbenennbar: %w", s.path, renameErr)
	}
	return nil
}

// nextSeq vergibt die naechste laufende Nummer.
func (s *Store) nextSeq() int {
	s.file.Seq++
	return s.file.Seq
}

// isRetryableRename meldet, ob ein fehlgeschlagenes Umbenennen wiederholt
// werden soll. Unter Windows ist eine Sperre durch einen gleichzeitigen Leser
// ein voruebergehender Zustand, kein Fehler der Ablage.
func isRetryableRename(err error) bool {
	if isWindows && errors.Is(err, fs.ErrPermission) {
		return true
	}
	var linkErr *os.LinkError
	if errors.As(err, &linkErr) && errors.Is(linkErr.Err, fs.ErrExist) {
		return true
	}
	return false
}

// AddProposal nimmt einen Vorschlag auf und liefert die vergebene Kennung.
// Die Kennung kommt vom Dienst, nie vom Aufrufer.
//
// Aufgezeichnet wird ein BRANCH MIT DIFF, keine angewandte Aenderung. Die
// Basisgeneration ist die Generation, die in diesem Augenblick aktiv ist —
// daran ist spaeter ablesbar, worauf sich die Freigabe bezog.
func (s *Store) AddProposal(p api.Proposal, d api.Diff) (*ProposalRecord, error) {
	id := fmt.Sprintf("prop-%04d", s.nextSeq())
	p.ID = id
	p.CreatedAt = time.Now().UTC()
	p.BaseGeneration = s.file.Current
	d.ProposalID = id
	rec := &ProposalRecord{
		Proposal:       p,
		Diff:           d,
		BaseGeneration: s.file.Current,
	}
	s.file.Proposals[id] = rec
	if err := s.Save(); err != nil {
		return nil, err
	}
	return rec, nil
}

// Proposal liefert die Aufzeichnung, oder nil.
func (s *Store) Proposal(id string) *ProposalRecord {
	if s.file.Proposals == nil {
		return nil
	}
	return s.file.Proposals[id]
}

// RecordCheck zeichnet das Pruefergebnis auf. Ab hier ist der Vorschlag
// geprueft — vorher weist die Politik jede Anwendung ab.
//
// Eine bereits erteilte Freigabe wird ung ueltig, wenn die neue Pruefung einen
// anderen Diff betrifft: eine Freigabe gilt immer genau fuer die Bytes, die
// freigegeben wurden.
func (s *Store) RecordCheck(id string, rec api.CheckRecord) error {
	p := s.Proposal(id)
	if p == nil {
		return fmt.Errorf("vorschlag %q nicht vorhanden", id)
	}
	if rec.At.IsZero() {
		rec.At = time.Now().UTC()
	}
	rec.Blocked = false
	for _, f := range rec.Findings {
		if f.Severity.Blocks() {
			rec.Blocked = true
		}
	}
	p.Checked = &rec
	if p.Approval != nil && p.Approval.DiffHash != rec.DiffHash {
		p.Approval = nil
	}
	return s.Save()
}

// RecordApproval zeichnet die ausdrueckliche menschliche Freigabe auf.
//
// Sie ist die einzige Stelle, an der eine Freigabe entstehen kann. Der
// Fingerabdruck wird auf den GEPRUEFTEN Diff festgelegt, nicht auf das, was
// der Aufrufer behauptet: die Aufzeichnung bleibt die Wahrheit.
func (s *Store) RecordApproval(id string, a api.Approval) (*api.Approval, error) {
	p := s.Proposal(id)
	if p == nil {
		return nil, fmt.Errorf("vorschlag %q nicht vorhanden", id)
	}
	if p.Checked == nil {
		return nil, fmt.Errorf("vorschlag %q ist nicht geprueft: eine Freigabe ohne Pruefbau waere blind", id)
	}
	a.By = strings.TrimSpace(a.By)
	if a.By == "" {
		return nil, fmt.Errorf("freigabe ohne Identitaet: wer freigibt, muss benannt sein")
	}
	if a.At.IsZero() {
		a.At = time.Now().UTC()
	}
	a.DiffHash = p.Checked.DiffHash
	a.BaseGeneration = p.BaseGeneration
	p.Approval = &a
	if err := s.Save(); err != nil {
		return nil, err
	}
	return p.Approval, nil
}

// ClearApproval nimmt eine Freigabe zurueck.
func (s *Store) ClearApproval(id string) error {
	p := s.Proposal(id)
	if p == nil {
		return fmt.Errorf("vorschlag %q nicht vorhanden", id)
	}
	p.Approval = nil
	return s.Save()
}

// MarkApplied haelt fest, dass ein Vorschlag angewandt wurde.
func (s *Store) MarkApplied(id, generationID string) error {
	p := s.Proposal(id)
	if p == nil {
		return fmt.Errorf("vorschlag %q nicht vorhanden", id)
	}
	p.Applied = true
	p.AppliedAt = time.Now().UTC().Format(time.RFC3339)
	p.GenerationID = generationID
	return s.Save()
}

// MarkBlocked haelt einen Ablehnungsgrund fest, damit ein wiederholter
// Versuch denselben Grund sichtbar macht.
func (s *Store) MarkBlocked(id, reason string) error {
	p := s.Proposal(id)
	if p == nil {
		return fmt.Errorf("vorschlag %q nicht vorhanden", id)
	}
	p.BlockedReason = reason
	return s.Save()
}

// Current nennt die aktive Generation, leer wenn es keine gibt.
func (s *Store) Current() string { return s.file.Current }

// Generations liefert die Generationen, neueste zuerst, die aktive markiert.
func (s *Store) Generations() []api.Generation {
	out := make([]api.Generation, len(s.file.Generations))
	for i, g := range s.file.Generations {
		g.Current = g.ID == s.file.Current
		out[i] = g
	}
	// Neueste zuerst: die juengste Aufnahme steht vorn, unabhaengig davon,
	// welche Generation gerade aktiv ist.
	for i, j := 0, len(out)-1; i < j; i, j = i+1, j-1 {
		out[i], out[j] = out[j], out[i]
	}
	return out
}

// Generation liefert eine Generation samt Markierung, oder false.
func (s *Store) Generation(id string) (api.Generation, bool) {
	for _, g := range s.file.Generations {
		if g.ID == id {
			g.Current = g.ID == s.file.Current
			return g, true
		}
	}
	return api.Generation{}, false
}

// AddGeneration traegt eine neue Generation ein und macht sie zur aktiven.
func (s *Store) AddGeneration(g api.Generation) (api.Generation, error) {
	g.ID = fmt.Sprintf("gen-%04d", s.nextSeq())
	if g.Created.IsZero() {
		g.Created = time.Now().UTC()
	}
	s.file.Generations = append(s.file.Generations, g)
	s.file.Current = g.ID
	if err := s.Save(); err != nil {
		return api.Generation{}, err
	}
	g.Current = true
	return g, nil
}

// SetCurrent schaltet auf eine vorhandene Generation um. Das ist der Rueckweg:
// ein Umschalten, keine Wiederherstellung.
func (s *Store) SetCurrent(id string) (api.Generation, error) {
	g, ok := s.Generation(id)
	if !ok {
		return api.Generation{}, fmt.Errorf("generation %q nicht vorhanden", id)
	}
	s.file.Current = id
	if err := s.Save(); err != nil {
		return api.Generation{}, err
	}
	g.Current = true
	return g, nil
}

// HashDiff bildet den Fingerabdruck eines Diffs. Die Politik vergleicht den
// Fingerabdruck der Aufzeichnung mit dem des aktuellen Diffs: wer den Diff
// nach der Pruefung tauscht, faellt damit durch.
//
// Die Kennung des Vorschlags geht ABSICHTLICH nicht in den Fingerabdruck ein:
// sie wird erst beim Aufnehmen vergeben, der Diff entsteht aber schon davor.
// Ginge sie ein, waere der Fingerabdruck nach dem Aufnehmen sofort falsch.
func HashDiff(d api.Diff) string {
	h := sha256.New()
	fmt.Fprintf(h, "flake\x00%s\x00target\x00%s\x00", d.Flake, d.Target)
	for _, f := range d.Files {
		fmt.Fprintf(h, "file\x00%s\x00%s\x00%s\x00", f.Path, f.Op, f.Hunks)
	}
	return "sha256:" + hex.EncodeToString(h.Sum(nil))
}
