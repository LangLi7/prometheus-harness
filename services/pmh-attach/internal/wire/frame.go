// Package wire ist der WebSocket-Traeger von pmh-attach: Handschlag und
// Rahmenformat nach RFC 6455, nur mit der Standardbibliothek.
//
// Warum eigener Code statt golang.org/x/net/websocket: das Paket waere zwar im
// Modul-Zwischenspeicher vorhanden, ist aber selbst als veraltet markiert und
// deckt Weder Fragmentierung noch das Close-Protokoll vollstaendig ab. Der
// Rahmen ist ueberschaubar (RFC 6455 §5 und §7) und hier vollstaendig
// getestet: Maskierung, erweiterte Nutzlaengen 126/127, Fragmentierung,
// Close-Austausch mit Code und Ping/Pong.
//
// Der Code ist eigenstaendig geschrieben; aus der Vorlage (npm-Paket `ws`,
// Typert-Gateway) stammen nur Verhalten und Namen, kein Quelltext.
package wire

import (
	"crypto/rand"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
)

// Opcodes nach RFC 6455 §5.2.
const (
	OpContinuation byte = 0x0
	OpText         byte = 0x1
	OpBinary       byte = 0x2
	OpClose        byte = 0x8
	OpPing         byte = 0x9
	OpPong         byte = 0xA
)

// Close-Codes nach RFC 6455 §7.4.1, die pmh-attach verwendet.
const (
	CloseNormalClosure  = 1000
	CloseGoingAway      = 1001
	CloseProtocolError  = 1002
	CloseTextRequired   = 1003
	CloseInvalidPayload = 1007
	ClosePolicyViolated = 1008
	CloseTooLarge       = 1009
	CloseInternalError  = 1011
)

// MaxControlPayload ist die Obergrenze einer Steuernachricht (RFC 6455 §5.5).
const MaxControlPayload = 125

// errProtocolVerletzt meldet einen Rahmen, den der Empfaenger mit
// CloseProtocolError beantworten muss.
var errProtocolVerletzt = errors.New("wire: Rahmen verletzt RFC 6455")

// CloseError traegt den Close-Code und den Grund eines beendeten Stroms.
type CloseError struct {
	Code   uint16
	Reason string
}

func (e *CloseError) Error() string {
	return fmt.Sprintf("wire: Gegenstelle hat mit Code %d geschlossen (%q)", e.Code, e.Reason)
}

// frame ist ein dekodierter Rahmen.
type frame struct {
	fin     bool
	opcode  byte
	masked  bool
	payload []byte
	// headerLen ist die Laenge des Rahmenkopfs; erweiterte Laengen zaehlen mit.
	headerLen int
}

// readFrame liest genau einen Rahmen. nextMask bestimmt, ob die Gegenstelle
// maskieren muss: der Server verlangt maskierte Rahmen, der Client nicht.
func readFrame(r io.Reader, nextMask bool, maxPayload int) (frame, error) {
	var head [2]byte
	if _, err := io.ReadFull(r, head[:]); err != nil {
		return frame{}, err
	}
	f := frame{
		fin:    head[0]&0x80 != 0,
		opcode: head[0] & 0x0F,
		masked: head[1]&0x80 != 0,
	}
	if head[0]&0x70 != 0 {
		// Reservierte Bits ohne vereinbarte Erweiterung (RFC 6455 §5.2).
		return frame{}, fmt.Errorf("%w: reservierte Bits gesetzt", errProtocolVerletzt)
	}
	if f.masked != nextMask {
		if nextMask {
			return frame{}, fmt.Errorf("%w: Client-Rahmen ist nicht maskiert", errProtocolVerletzt)
		}
		return frame{}, fmt.Errorf("%w: Server-Rahmen ist maskiert", errProtocolVerletzt)
	}

	length := uint64(head[1] & 0x7F)
	headerLen := 2
	switch length {
	case 126:
		var ext [2]byte
		if _, err := io.ReadFull(r, ext[:]); err != nil {
			return frame{}, err
		}
		length = uint64(binary.BigEndian.Uint16(ext[:]))
		headerLen += 2
	case 127:
		var ext [8]byte
		if _, err := io.ReadFull(r, ext[:]); err != nil {
			return frame{}, err
		}
		length = binary.BigEndian.Uint64(ext[:])
		headerLen += 8
	}
	if maxPayload > 0 && length > uint64(maxPayload) {
		return frame{}, fmt.Errorf("wire: Nutzlast von %d Bytes ueberschreitet die Grenze %d", length, maxPayload)
	}

	var mask [4]byte
	if f.masked {
		if _, err := io.ReadFull(r, mask[:]); err != nil {
			return frame{}, err
		}
		headerLen += 4
	}
	f.headerLen = headerLen

	if length == 0 {
		return f, nil
	}
	// Eine Nutzlast groesser als der int-Bereich ist auf dieser Plattform
	// nicht darstellbar; die Grenze oben faengt das praktisch ab.
	payload := make([]byte, int(length))
	if _, err := io.ReadFull(r, payload); err != nil {
		return frame{}, err
	}
	if f.masked {
		for i := range payload {
			payload[i] ^= mask[i%4]
		}
	}
	f.payload = payload
	return f, nil
}

// encodeFrame baut einen Rahmen. Der Kopf wird in buf aufgebaut, damit eine
// Nachricht in wenigen write-Aufrufen auf die Leitung geht.
func encodeFrame(opcode byte, payload []byte, fin bool, mask bool) ([]byte, error) {
	if isControl(opcode) {
		if len(payload) > MaxControlPayload {
			return nil, fmt.Errorf("wire: Steuernachricht von %d Bytes ist zu gross", len(payload))
		}
		if !fin {
			return nil, fmt.Errorf("wire: Steuernachricht darf nicht fragmentiert sein")
		}
	}
	head := make([]byte, 0, 14)
	b0 := opcode
	if fin {
		b0 |= 0x80
	}
	head = append(head, b0)

	var ext []byte
	switch n := len(payload); {
	case n < 126:
		head = append(head, byte(n))
	case n <= 0xFFFF:
		head = append(head, 126)
		ext = make([]byte, 2)
		binary.BigEndian.PutUint16(ext, uint16(n))
	default:
		head = append(head, 127)
		ext = make([]byte, 8)
		binary.BigEndian.PutUint64(ext, uint64(n))
	}
	head = append(head, ext...)

	if !mask {
		return append(head, payload...), nil
	}
	head[1] |= 0x80
	var key [4]byte
	if _, err := rand.Read(key[:]); err != nil {
		return nil, err
	}
	head = append(head, key[:]...)
	masked := make([]byte, len(payload))
	for i := range payload {
		masked[i] = payload[i] ^ key[i%4]
	}
	return append(head, masked...), nil
}

func isControl(opcode byte) bool { return opcode&0x08 != 0 }

// encodeClose baut die Nutzlast eines Close-Rahmens: zwei Byte Code, danach
// der UTF-8-Grund (RFC 6455 §5.5.1).
func encodeClose(code uint16, reason string) []byte {
	payload := make([]byte, 2, 2+len(reason))
	binary.BigEndian.PutUint16(payload, code)
	return append(payload, reason...)
}

// decodeClose liest Code und Grund aus einer Close-Nutzlast. Eine leere
// Nutzlast ist ein Close ohne Code (RFC 6455 §7.1.5).
func decodeClose(payload []byte) (uint16, string, error) {
	if len(payload) == 0 {
		return 0, "", nil
	}
	if len(payload) == 1 {
		return 0, "", fmt.Errorf("%w: Close-Nutzlast von 1 Byte", errProtocolVerletzt)
	}
	code := binary.BigEndian.Uint16(payload[:2])
	if !gueltigerCloseCode(code) {
		return 0, "", fmt.Errorf("%w: Close-Code %d ist nicht erlaubt", errProtocolVerletzt, code)
	}
	return code, string(payload[2:]), nil
}

// gueltigerCloseCode prueft den Codebereich nach RFC 6455 §7.4.
func gueltigerCloseCode(code uint16) bool {
	switch {
	case code >= 3000 && code <= 4999:
		return true
	case code >= 1000 && code <= 1014:
		// 1004, 1005 und 1006 sind reserviert und duerfen nicht gesendet werden.
		return code != 1004 && code != 1005 && code != 1006
	default:
		return false
	}
}
