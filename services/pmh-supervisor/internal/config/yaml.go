package config

import (
	"fmt"
	"strconv"
	"strings"
)

// yamlLine ist eine logische Zeile der YAML-Teilmenge.
type yamlLine struct {
	indent  int
	content string
	number  int
}

// ParseYAMLSubset liest eine bewusst kleine YAML-Teilmenge und liefert sie als
// generische Struktur aus map[string]any / []any / Skalaren zurueck. Der
// Aufrufer wandelt das Ergebnis anschliessend ueber encoding/json in Config.
//
// Unterstuetzt wird genau das, was eine Dienstbeschreibung braucht:
//
//	version: 1
//	log_level: info
//	shutdown_timeout: 15
//	processes:
//	  - name: cache
//	    exec: node
//	    args: ["a", "b"]
//	    env:
//	      - PMH_X=1
//	    optional: true
//	    max_restarts: -1
//	    backoff:
//	      initial: 0.5
//	      max: 30
//	      factor: 2
//	      jitter: 0.2
//
// Nicht unterstuetzt (und deshalb ein Fehler statt einer stillen Fehldeutung):
// Anker/Aliase, `|`/`>`-Blocktexte, mehrere Dokumente (`---`), Tabs als
// Einrueckung, Fliesskomma-Mappings `{}` und `[]` in YAML-Schreibweise,
// Kommentare hinter Werten. Unbekannte Schluessel sind immer ein Fehler.
func ParseYAMLSubset(raw []byte) (map[string]any, error) {
	lines, err := scanYAMLLines(raw)
	if err != nil {
		return nil, err
	}
	if len(lines) == 0 {
		return nil, fmt.Errorf("%w: leere Datei", ErrYAMLSubset)
	}
	p := &yamlParser{lines: lines}
	value, err := p.parseBlock(lines[0].indent)
	if err != nil {
		return nil, err
	}
	if p.pos != len(p.lines) {
		return nil, fmt.Errorf("%w: Zeile %d: unerwarteter Inhalt", ErrYAMLSubset, p.lines[p.pos].number)
	}
	doc, ok := value.(map[string]any)
	if !ok {
		return nil, fmt.Errorf("%w: Wurzel muss ein Mapping sein", ErrYAMLSubset)
	}
	if err := validateYAMLKeys(doc); err != nil {
		return nil, err
	}
	return doc, nil
}

type yamlParser struct {
	lines []yamlLine
	pos   int
}

// parseBlock liest einen Block mit mindestens der Einrueckung indent.
func (p *yamlParser) parseBlock(indent int) (any, error) {
	if p.pos >= len(p.lines) {
		return nil, fmt.Errorf("%w: unerwartetes Dateiende", ErrYAMLSubset)
	}
	first := p.lines[p.pos]
	if first.indent < indent {
		return nil, fmt.Errorf("%w: Zeile %d: Einrueckung zu gering", ErrYAMLSubset, first.number)
	}
	if isYAMLItem(first.content) {
		return p.parseSequence(first.indent)
	}
	return p.parseMapping(first.indent)
}

func isYAMLItem(content string) bool {
	return content == "-" || strings.HasPrefix(content, "- ")
}

func (p *yamlParser) parseMapping(indent int) (map[string]any, error) {
	out := make(map[string]any)
	for p.pos < len(p.lines) {
		line := p.lines[p.pos]
		if line.indent < indent {
			break
		}
		if line.indent > indent {
			return nil, fmt.Errorf("%w: Zeile %d: unerwartete Einrueckung", ErrYAMLSubset, line.number)
		}
		if isYAMLItem(line.content) {
			return nil, fmt.Errorf("%w: Zeile %d: Sequenz innerhalb eines Mappings ohne Schluessel", ErrYAMLSubset, line.number)
		}
		key, rest, found := strings.Cut(line.content, ":")
		if !found {
			return nil, fmt.Errorf("%w: Zeile %d: kein Schluessel-Wert-Paar", ErrYAMLSubset, line.number)
		}
		if !isYAMLPairSeparator(rest) {
			return nil, fmt.Errorf("%w: Zeile %d: Doppelpunkt ohne Trenner (Schluessel: Wert erwartet)", ErrYAMLSubset, line.number)
		}
		key = strings.TrimSpace(key)
		if key == "" {
			return nil, fmt.Errorf("%w: Zeile %d: leerer Schluessel", ErrYAMLSubset, line.number)
		}
		if _, dup := out[key]; dup {
			return nil, fmt.Errorf("%w: Zeile %d: Schluessel %q doppelt", ErrYAMLSubset, line.number, key)
		}
		rest = strings.TrimSpace(rest)
		p.pos++
		if rest == "" {
			if p.pos >= len(p.lines) || p.lines[p.pos].indent <= indent {
				return nil, fmt.Errorf("%w: Zeile %d: Schluessel %q ohne Wert", ErrYAMLSubset, line.number, key)
			}
			// Der eingrueckte Block kann ein Mapping oder eine Sequenz sein
			// (typisch: "env:" mit "- NAME=WERT"-Eintraegen).
			value, err := p.parseBlock(p.lines[p.pos].indent)
			if err != nil {
				return nil, err
			}
			out[key] = value
			continue
		}
		if rest == "|" || rest == ">" || rest == "|-" || rest == ">-" {
			return nil, fmt.Errorf("%w: Zeile %d: Blocktexte sind nicht unterstuetzt", ErrYAMLSubset, line.number)
		}
		value, err := parseYAMLScalar(rest, line.number)
		if err != nil {
			return nil, err
		}
		out[key] = value
	}
	return out, nil
}

// isYAMLPairSeparator prueft, ob ein Doppelpunkt wirklich ein
// Schluessel-Wert-Trenner ist und nicht Teil eines Werts wie
// "PMH_URL=postgres://localhost/pmh".
func isYAMLPairSeparator(rest string) bool {
	if rest == "" {
		return true
	}
	switch rest[0] {
	case ' ', '\t':
		return true
	default:
		return false
	}
}

func (p *yamlParser) parseSequence(indent int) ([]any, error) {
	out := []any{}
	for p.pos < len(p.lines) {
		line := p.lines[p.pos]
		if line.indent < indent {
			break
		}
		if line.indent > indent {
			return nil, fmt.Errorf("%w: Zeile %d: unerwartete Einrueckung in einer Sequenz", ErrYAMLSubset, line.number)
		}
		if !isYAMLItem(line.content) {
			break
		}
		rest := strings.TrimSpace(strings.TrimPrefix(line.content, "-"))
		if rest == "" {
			p.pos++
			if p.pos >= len(p.lines) || p.lines[p.pos].indent <= indent {
				out = append(out, nil)
				continue
			}
			value, err := p.parseBlock(p.lines[p.pos].indent)
			if err != nil {
				return nil, err
			}
			out = append(out, value)
			continue
		}
		// "- schluessel: wert" beginnt ein verschachteltes Mapping, dessen
		// weitere Zeilen tiefer eingerueckt sind.
		if key, value, found := splitYAMLKey(rest); found {
			p.pos++
			item := map[string]any{}
			innerIndent := indent + 2
			if p.pos < len(p.lines) && p.lines[p.pos].indent > indent {
				innerIndent = p.lines[p.pos].indent
			}
			valueWasSequence := false
			if strings.TrimSpace(value) == "" {
				if p.pos >= len(p.lines) || p.lines[p.pos].indent <= indent {
					return nil, fmt.Errorf("%w: Zeile %d: Schluessel %q ohne Wert", ErrYAMLSubset, line.number, key)
				}
				next := p.lines[p.pos]
				var sub any
				var err error
				if isYAMLItem(next.content) {
					// Verschachtelte Sequenz, z. B. "env:" mit "- X=1".
					sub, err = p.parseSequence(next.indent)
					valueWasSequence = true
				} else {
					sub, err = p.parseBlock(next.indent)
				}
				if err != nil {
					return nil, err
				}
				item[key] = sub
			} else {
				scalar, err := parseYAMLScalar(value, line.number)
				if err != nil {
					return nil, err
				}
				item[key] = scalar
			}
			switch {
			case valueWasSequence:
				// Nach einer Sequenz darf kein Mapping mehr folgen: das waere
				// eine unklare Einrueckung, keine gueltige Dienstbeschreibung.
				if p.pos < len(p.lines) && p.lines[p.pos].indent >= innerIndent {
					return nil, fmt.Errorf("%w: Zeile %d: unerwartete Einrueckung nach einer Sequenz",
						ErrYAMLSubset, p.lines[p.pos].number)
				}
			case p.pos < len(p.lines) && p.lines[p.pos].indent >= innerIndent:
				if isYAMLItem(p.lines[p.pos].content) {
					return nil, fmt.Errorf("%w: Zeile %d: unerwartete Sequenz", ErrYAMLSubset, p.lines[p.pos].number)
				}
				more, err := p.parseMapping(p.lines[p.pos].indent)
				if err != nil {
					return nil, err
				}
				for k, v := range more {
					if _, dup := item[k]; dup {
						return nil, fmt.Errorf("%w: Zeile %d: Schluessel %q doppelt", ErrYAMLSubset, line.number, k)
					}
					item[k] = v
				}
			}
			out = append(out, item)
			continue
		}
		scalar, err := parseYAMLScalar(rest, line.number)
		if err != nil {
			return nil, err
		}
		p.pos++
		out = append(out, scalar)
	}
	return out, nil
}

func splitYAMLKey(s string) (key, value string, found bool) {
	inSingle, inDouble := false, false
	for i := 0; i < len(s); i++ {
		switch s[i] {
		case '\'':
			if !inDouble {
				inSingle = !inSingle
			}
		case '"':
			if !inSingle {
				inDouble = !inDouble
			}
		case ':':
			if inSingle || inDouble {
				continue
			}
			if !isYAMLPairSeparator(s[i+1:]) {
				continue
			}
			return strings.TrimSpace(s[:i]), strings.TrimSpace(s[i+1:]), true
		}
	}
	return "", "", false
}

func parseYAMLScalar(s string, line int) (any, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil, fmt.Errorf("%w: Zeile %d: leerer Wert", ErrYAMLSubset, line)
	}
	if strings.HasPrefix(s, "&") || strings.HasPrefix(s, "*") {
		return nil, fmt.Errorf("%w: Zeile %d: Anker und Aliase sind nicht unterstuetzt", ErrYAMLSubset, line)
	}
	if strings.HasPrefix(s, "[") || strings.HasPrefix(s, "{") {
		return parseYAMLFlow(s, line)
	}
	if len(s) >= 2 && (s[0] == '"' || s[0] == '\'') {
		quote := s[0]
		if s[len(s)-1] != quote {
			return nil, fmt.Errorf("%w: Zeile %d: nicht geschlossenes Anfuehrungszeichen", ErrYAMLSubset, line)
		}
		return s[1 : len(s)-1], nil
	}
	switch strings.ToLower(s) {
	case "true":
		return true, nil
	case "false":
		return false, nil
	case "null", "~":
		return nil, nil
	}
	if i, err := strconv.ParseInt(s, 10, 64); err == nil {
		return i, nil
	}
	if f, err := strconv.ParseFloat(s, 64); err == nil {
		return f, nil
	}
	return s, nil
}

// parseYAMLFlow liest die Fliesskomma-Form ["a", "b"] bzw. {a: 1}.
func parseYAMLFlow(s string, line int) (any, error) {
	switch {
	case strings.HasPrefix(s, "["):
		if !strings.HasSuffix(s, "]") {
			return nil, fmt.Errorf("%w: Zeile %d: ungeschlossene Sequenz", ErrYAMLSubset, line)
		}
		inner := strings.TrimSpace(s[1 : len(s)-1])
		if inner == "" {
			return []any{}, nil
		}
		parts := splitFlow(inner)
		out := make([]any, 0, len(parts))
		for _, part := range parts {
			v, err := parseYAMLScalar(part, line)
			if err != nil {
				return nil, err
			}
			out = append(out, v)
		}
		return out, nil
	case strings.HasPrefix(s, "{"):
		if !strings.HasSuffix(s, "}") {
			return nil, fmt.Errorf("%w: Zeile %d: ungeschlossenes Mapping", ErrYAMLSubset, line)
		}
		inner := strings.TrimSpace(s[1 : len(s)-1])
		out := map[string]any{}
		if inner == "" {
			return out, nil
		}
		for _, part := range splitFlow(inner) {
			key, value, found := splitYAMLKey(part)
			if !found {
				return nil, fmt.Errorf("%w: Zeile %d: kein Schluessel-Wert-Paar in %q", ErrYAMLSubset, line, part)
			}
			v, err := parseYAMLScalar(value, line)
			if err != nil {
				return nil, err
			}
			out[key] = v
		}
		return out, nil
	default:
		return nil, fmt.Errorf("%w: Zeile %d: unlesbarer Wert %q", ErrYAMLSubset, line, s)
	}
}

func splitFlow(s string) []string {
	var parts []string
	depth := 0
	inSingle, inDouble := false, false
	start := 0
	for i, r := range s {
		switch {
		case r == '\'' && !inDouble:
			inSingle = !inSingle
		case r == '"' && !inSingle:
			inDouble = !inDouble
		case (r == '[' || r == '{') && !inSingle && !inDouble:
			depth++
		case (r == ']' || r == '}') && !inSingle && !inDouble:
			depth--
		case r == ',' && depth == 0 && !inSingle && !inDouble:
			parts = append(parts, strings.TrimSpace(s[start:i]))
			start = i + 1
		}
	}
	parts = append(parts, strings.TrimSpace(s[start:]))
	return parts
}

func scanYAMLLines(raw []byte) ([]yamlLine, error) {
	var out []yamlLine
	for i, rawLine := range strings.Split(strings.ReplaceAll(string(raw), "\r\n", "\n"), "\n") {
		number := i + 1
		line := rawLine
		if idx := strings.IndexByte(line, '#'); idx >= 0 {
			line = line[:idx]
		}
		if strings.TrimSpace(line) == "" {
			continue
		}
		indent := 0
		for indent < len(line) && line[indent] == ' ' {
			indent++
		}
		if indent < len(line) && line[indent] == '\t' {
			return nil, fmt.Errorf("%w: Zeile %d: Tabulator als Einrueckung", ErrYAMLSubset, number)
		}
		content := strings.TrimRight(line[indent:], " \t")
		if content == "---" || content == "..." {
			if len(out) == 0 {
				continue
			}
			return nil, fmt.Errorf("%w: Zeile %d: mehrere Dokumente sind nicht unterstuetzt", ErrYAMLSubset, number)
		}
		out = append(out, yamlLine{indent: indent, content: content, number: number})
	}
	return out, nil
}

// Erlaubte Schluessel je Ebene. Ein Tippfehler soll ein Fehler sein, kein
// stiller Nichtstart (Regel 3: sichtbar scheitern).
var yamlSchema = map[string]map[string]bool{
	"": {
		"version": true, "shutdown_timeout": true, "health_interval": true,
		"log_level": true, "processes": true,
	},
	"processes": {
		"name": true, "exec": true, "args": true, "dir": true, "env": true,
		"optional": true, "restart": true, "max_restarts": true, "backoff": true,
		"shutdown_grace": true,
	},
	"processes.backoff": {
		"initial": true, "max": true, "factor": true, "jitter": true,
	},
}

func validateYAMLKeys(doc map[string]any) error {
	for key, value := range doc {
		if !yamlSchema[""][key] {
			return fmt.Errorf("%w: %q", ErrUnknownField, key)
		}
		if key != "processes" {
			continue
		}
		list, ok := value.([]any)
		if !ok {
			return fmt.Errorf("%w: \"processes\" muss eine Liste sein", ErrInvalidConfig)
		}
		for i, item := range list {
			entry, ok := item.(map[string]any)
			if !ok {
				return fmt.Errorf("%w: processes[%d] muss ein Mapping sein", ErrInvalidConfig, i)
			}
			for pkey, pvalue := range entry {
				if !yamlSchema["processes"][pkey] {
					return fmt.Errorf("%w: processes[%d].%s", ErrUnknownField, i, pkey)
				}
				if pkey != "backoff" {
					continue
				}
				bmap, ok := pvalue.(map[string]any)
				if !ok {
					return fmt.Errorf("%w: processes[%d].backoff muss ein Mapping sein", ErrInvalidConfig, i)
				}
				for bkey := range bmap {
					if !yamlSchema["processes.backoff"][bkey] {
						return fmt.Errorf("%w: processes[%d].backoff.%s", ErrUnknownField, i, bkey)
					}
				}
			}
		}
	}
	return nil
}
