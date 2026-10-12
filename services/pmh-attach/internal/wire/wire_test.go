package wire

import (
	"bufio"
	"bytes"
	"encoding/binary"
	"errors"
	"io"
	"net"
	"net/http"
	"strings"
	"sync"
	"testing"
	"time"
)

// paar baut zwei verbundene Seiten: links ist der Server (verlangt maskierte
// Rahmen), rechts der Client (maskiert selbst).
//
// Bewusst ein echtes TCP-Paar statt net.Pipe: eine Pipe ist synchron, jedes
// Schreiben blockiert bis zum Lesen auf der anderen Seite — ein Test, der
// Rahmen in beiden Richtungen prueft, bliebe daran haengen, obwohl der Draht in
// Ordnung ist. TCP puffert, wie es die Wirklichkeit auch tut.
func paar(t *testing.T) (server, client *Conn) {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("kein Port: %v", err)
	}
	defer func() { _ = ln.Close() }()

	type ergebnis struct {
		conn net.Conn
		err  error
	}
	angenommen := make(chan ergebnis, 1)
	go func() {
		c, err := ln.Accept()
		angenommen <- ergebnis{c, err}
	}()
	rechts, err := net.Dial("tcp", ln.Addr().String())
	if err != nil {
		t.Fatalf("kein Verbinden: %v", err)
	}
	res := <-angenommen
	if res.err != nil {
		t.Fatalf("kein Annehmen: %v", res.err)
	}
	links := res.conn
	t.Cleanup(func() { _ = links.Close(); _ = rechts.Close() })
	server = newConn(links, bufio.NewReader(links), true)
	client = newConn(rechts, bufio.NewReader(rechts), false)
	return server, client
}

// rohrahmen baut einen Rahmen als Bytes, damit Tests genau pruefen, was auf der
// Leitung steht.
func rohrahmen(t *testing.T, opcode byte, payload []byte, fin, maskiert bool) []byte {
	t.Helper()
	buf, err := encodeFrame(opcode, payload, fin, maskiert)
	if err != nil {
		t.Fatalf("Rahmen nicht baubar: %v", err)
	}
	return buf
}

// leseRahmen liest einen Rahmen von einem Socket.
func leseRahmen(t *testing.T, c *Conn, mussMaskiertSein bool) frame {
	t.Helper()
	_ = c.conn.SetReadDeadline(time.Now().Add(3 * time.Second))
	f, err := readFrame(c.br, mussMaskiertSein, 0)
	if err != nil {
		t.Fatalf("Rahmen nicht lesbar: %v", err)
	}
	return f
}

// ---- Nutzlaengen 125 / 126 / 127 -------------------------------------------

// TestPayloadLengthsUseTheRightEncoding prueft die Kodierung der Nutzlaenge:
// bis 125 steht sie im zweiten Byte, ab 126 in zwei zusaetzlichen Bytes, ab
// 65536 in acht. Getestet wird auf der Leitung, nicht nur im Ergebnis.
//
// Ein maskierter Rahmen traegt zusaetzlich den 4-Byte-Maskierungsschluessel
// (RFC 6455 §5.2), deshalb 6, 8 und 14 Byte Kopf.
func TestPayloadLengthsUseTheRightEncoding(t *testing.T) {
	faelle := []struct {
		groesse  int
		kopfbits int
	}{
		{0, 6},
		{125, 6},
		{126, 8},
		{65535, 8},
		{65536, 14},
	}
	// Ein Paar je Fall: net.Pipe ist synchron, deshalb bekommt jeder Fall
	// frische Sockets ohne blockierende Reste.
	for _, fall := range faelle {
		nachricht := bytes.Repeat([]byte{'a'}, fall.groesse)
		server, client := paar(t)
		go func() { _ = client.WriteMessage(OpText, nachricht) }()

		_ = server.conn.SetReadDeadline(time.Now().Add(3 * time.Second))
		f, err := readFrame(server.br, true, 0)
		if err != nil {
			t.Fatalf("Groesse %d: Rahmen nicht lesbar: %v", fall.groesse, err)
		}
		if f.headerLen != fall.kopfbits {
			t.Errorf("Groesse %d: Kopflaenge = %d, erwartet %d", fall.groesse, f.headerLen, fall.kopfbits)
		}
		if f.opcode != OpText || !f.fin || !f.masked {
			t.Errorf("Groesse %d: Rahmen = %+v", fall.groesse, f)
		}
		if len(f.payload) != fall.groesse {
			t.Errorf("Groesse %d: Nutzlast = %d", fall.groesse, len(f.payload))
		}
		if !bytes.Equal(f.payload, nachricht) {
			t.Errorf("Groesse %d: Nutzlast stimmt nicht", fall.groesse)
		}
		_ = client.conn.Close()
		_ = server.conn.Close()
	}
}

// TestExtendedLengthIsBigEndian prueft die Reihenfolge der Bytes der
// erweiterten Laenge: 126 als zwei Bytes, 127 als acht.
func TestExtendedLengthIsBigEndian(t *testing.T) {
	payload := bytes.Repeat([]byte{'x'}, 300)
	rahmen := rohrahmen(t, OpText, payload, true, true)
	if rahmen[1]&0x7F != 126 {
		t.Fatalf("Laengenbyte = %d, erwartet 126", rahmen[1]&0x7F)
	}
	if got := binary.BigEndian.Uint16(rahmen[2:4]); got != 300 {
		t.Fatalf("erweiterte Laenge = %d, erwartet 300 (Big Endian)", got)
	}
	if len(rahmen) != 4+4+300 {
		t.Fatalf("Rahmenlaenge = %d, erwartet %d", len(rahmen), 4+4+300)
	}
}

// TestClientFramesAreMasked prueft, dass ein Client-Rahmen maskiert auf die
// Leitung geht (RFC 6455 §5.3) und dass die Nutzlast nach dem Entmaskieren
// wieder stimmt.
func TestClientFramesAreMasked(t *testing.T) {
	server, client := paar(t)
	text := "maskiert"
	go func() { _ = client.WriteMessage(OpText, []byte(text)) }()

	f := leseRahmen(t, server, true)
	if !f.masked {
		t.Fatal("der Client-Rahmen ist nicht maskiert")
	}
	if string(f.payload) != text {
		t.Fatalf("Nutzlast = %q, erwartet %q", f.payload, text)
	}

	// Der Maskierungsschluessel muss sich vom Klartext unterscheiden, sonst
	// waere der Rahmen nur zufaellig unverschluesselt.
	if bytes.Contains(rohrahmen(t, OpText, []byte("gleich"), true, true), []byte("gleich")) {
		t.Error("der Rahmen traegt den Klartext unverschluesselt")
	}
}

// TestUnmaskedClientFrameIsRejected prueft, dass ein unmaskierter Rahmen eines
// Clients mit 1002 beantwortet wird — so verlangt es RFC 6455 §5.1.
func TestUnmaskedClientFrameIsRejected(t *testing.T) {
	server, client := paar(t)

	fertig := make(chan error, 1)
	go func() {
		_, _, err := server.ReadMessage()
		fertig <- err
	}()
	// unmaskiert, wie ein feindlicher Client es schicken wuerde
	if _, err := client.conn.Write(rohrahmen(t, OpText, []byte("ohne Maske"), true, false)); err != nil {
		t.Fatalf("Schreiben: %v", err)
	}

	var err error
	select {
	case err = <-fertig:
	case <-time.After(3 * time.Second):
		t.Fatal("der Server hat den unmaskierten Rahmen nicht beanstandet")
	}
	if err == nil {
		t.Fatal("der unmaskierte Rahmen wurde angenommen")
	}
	var ce *CloseError
	if !errors.As(err, &ce) || ce.Code != CloseProtocolError {
		t.Fatalf("Fehler = %v, erwartet CloseError 1002", err)
	}
	// Der Client muss den Close-Rahmen mit Code 1002 sehen.
	_ = client.conn.SetReadDeadline(time.Now().Add(3 * time.Second))
	f, err := readFrame(client.br, false, 0)
	if err != nil {
		t.Fatalf("kein Close-Rahmen: %v", err)
	}
	if code, _, derr := decodeClose(f.payload); f.opcode != OpClose || derr != nil || code != CloseProtocolError {
		t.Fatalf("Antwort = opcode %d, Code %d, Fehler %v", f.opcode, code, derr)
	}
}

// ---- Fragmentierung --------------------------------------------------------

// TestLargeMessageIsFragmentedAndReassembled prueft beide Richtungen der
// Fragmentierung: zerlegt wird ab SetFragmented, zusammengesetzt beim Lesen.
func TestLargeMessageIsFragmentedAndReassembled(t *testing.T) {
	server, client := paar(t)
	client.SetFragmented(16)

	nachricht := strings.Repeat("ABCDEFGHIJ", 40) // 400 Bytes -> 25 Rahmen
	fertig := make(chan string, 1)
	go func() {
		if _, payload, err := server.ReadMessage(); err == nil {
			fertig <- string(payload)
		} else {
			fertig <- "FEHLER: " + err.Error()
		}
	}()
	if err := client.WriteMessage(OpText, []byte(nachricht)); err != nil {
		t.Fatalf("Schreiben: %v", err)
	}
	select {
	case got := <-fertig:
		if got != nachricht {
			t.Fatalf("zusammengesetzt = %d Bytes, erwartet %d", len(got), len(nachricht))
		}
	case <-time.After(3 * time.Second):
		t.Fatal("die fragmentierte Nachricht kam nicht an")
	}
}

// TestFragmentationUsesFirstAndContinuationFrames prueft die Rahmenfolge auf
// der Leitung: erster Rahmen mit dem echten Opcode, danach Continuation.
func TestFragmentationUsesFirstAndContinuationFrames(t *testing.T) {
	server, client := paar(t)
	client.SetFragmented(4)

	go func() { _ = client.WriteMessage(OpText, []byte("abcdefghij")) }()

	var opcodes []byte
	var fins []bool
	for {
		f := leseRahmen(t, server, true)
		opcodes = append(opcodes, f.opcode)
		fins = append(fins, f.fin)
		if f.fin {
			break
		}
	}
	if len(opcodes) != 3 {
		t.Fatalf("%d Rahmen fuer 10 Bytes bei Grenze 4, erwartet 3", len(opcodes))
	}
	if opcodes[0] != OpText || opcodes[1] != OpContinuation || opcodes[2] != OpContinuation {
		t.Fatalf("Opcodes = %v, erwartet [1 0 0]", opcodes)
	}
	if fins[0] || fins[1] || !fins[2] {
		t.Fatalf("FIN-Bits = %v, erwartet nur der letzte Rahmen schliesst ab", fins)
	}
}

// TestContinuationWithoutStartIsRejected prueft einen Fortsetzungsrahmen ohne
// begonnenen Rahmen.
func TestContinuationWithoutStartIsRejected(t *testing.T) {
	server, client := paar(t)
	go func() {
		_, _ = client.conn.Write(rohrahmen(t, OpContinuation, []byte("x"), true, true))
	}()
	_, _, err := server.ReadMessage()
	var ce *CloseError
	if !errors.As(err, &ce) || ce.Code != CloseProtocolError {
		t.Fatalf("Fehler = %v, erwartet CloseError 1002", err)
	}
}

// TestNonMinimalLengthEncodingIsRejected prueft, dass ein Rahmen mit
// erweiterter Laenge, der kuerzer haette sein koennen, abgelehnt wird
// (RFC 6455 §5.2).
func TestNonMinimalLengthEncodingIsRejected(t *testing.T) {
	server, client := paar(t)
	go func() {
		// Nutzlast 1 Byte, aber als 126-Rahmen kodiert.
		rahmen := []byte{0x81, 126, 0, 1, 0, 0, 0, 0, 'x'}
		_, _ = client.conn.Write(rahmen)
	}()
	_, _, err := server.ReadMessage()
	var ce *CloseError
	if !errors.As(err, &ce) || ce.Code != CloseProtocolError {
		t.Fatalf("Fehler = %v, erwartet CloseError 1002", err)
	}
}

// ---- Close-Austausch -------------------------------------------------------

// TestCloseHandshakeWithCode prueft den Close-Austausch: die Gegenstelle
// bekommt denselben Code zurueck, den sie geschickt hat.
func TestCloseHandshakeWithCode(t *testing.T) {
	server, client := paar(t)
	gesendet := make(chan error, 1)
	go func() {
		gesendet <- client.WriteMessage(OpClose, encodeClose(ClosePolicyViolated, "ungueltiger Rahmen"))
	}()

	_, _, err := server.ReadMessage()
	var ce *CloseError
	if !errors.As(err, &ce) {
		t.Fatalf("Fehler = %v, erwartet CloseError", err)
	}
	if ce.Code != ClosePolicyViolated {
		t.Errorf("Code = %d, erwartet %d", ce.Code, ClosePolicyViolated)
	}
	if !strings.Contains(ce.Reason, "ungueltiger Rahmen") {
		t.Errorf("Grund = %q", ce.Reason)
	}
	if !server.CloseSent() {
		t.Error("der Server muss den Close-Rahmen erwidert haben")
	}

	_ = client.conn.SetReadDeadline(time.Now().Add(3 * time.Second))
	f, err := readFrame(client.br, false, 0)
	if err != nil {
		t.Fatalf("kein Close-Rahmen: %v", err)
	}
	if f.opcode != OpClose {
		t.Fatalf("Opcode = %d, erwartet Close", f.opcode)
	}
	if code, _, derr := decodeClose(f.payload); derr != nil || code != ClosePolicyViolated {
		t.Errorf("zurueckgeschickter Code = %d (%v)", code, derr)
	}
	if err := <-gesendet; err != nil {
		t.Fatalf("Senden: %v", err)
	}
	// CloseSent setzt nur SendClose; das Schliessen des Drahts ist Sache des
	// Aufrufers. Der Close-Austausch des SERVERS wird unten geprueft.
	if err := client.SendClose(CloseNormalClosure, "fertig"); err != nil {
		t.Fatalf("SendClose: %v", err)
	}
	if !client.CloseSent() {
		t.Error("CloseSent muss nach SendClose true sein")
	}
}

// TestServerCloseCarriesCodeAndIsIdempotent prueft SendClose: der Code kommt
// an, und ein zweiter Aufruf schreibt keinen weiteren Rahmen.
func TestServerCloseCarriesCodeAndIsIdempotent(t *testing.T) {
	server, client := paar(t)
	if err := server.SendClose(CloseInternalError, "Upstream weg"); err != nil {
		t.Fatalf("SendClose: %v", err)
	}
	if err := server.SendClose(CloseInternalError, "nochmal"); err != nil {
		t.Fatalf("zweiter SendClose: %v", err)
	}

	f, err := readFrame(client.br, false, 0)
	if err != nil {
		t.Fatalf("kein Close-Rahmen: %v", err)
	}
	code, grund, derr := decodeClose(f.payload)
	if derr != nil || code != CloseInternalError {
		t.Fatalf("Code = %d (%v), erwartet %d", code, derr, CloseInternalError)
	}
	if grund != "Upstream weg" {
		t.Errorf("Grund = %q", grund)
	}

	// Kein zweiter Close-Rahmen.
	_ = client.conn.SetReadDeadline(time.Now().Add(100 * time.Millisecond))
	if _, err := readFrame(client.br, false, 0); err == nil {
		t.Error("es wurde ein zweiter Close-Rahmen geschrieben")
	}
}

// TestCloseWithoutCodeIsAccepted prueft einen Close-Rahmen ohne Code
// (RFC 6455 §7.1.5).
func TestCloseWithoutCodeIsAccepted(t *testing.T) {
	server, client := paar(t)
	fertig := make(chan error, 1)
	go func() {
		_, _, err := server.ReadMessage()
		fertig <- err
	}()
	if _, err := client.conn.Write(rohrahmen(t, OpClose, nil, true, true)); err != nil {
		t.Fatalf("Schreiben: %v", err)
	}
	var err error
	select {
	case err = <-fertig:
	case <-time.After(3 * time.Second):
		t.Fatal("der Close-Rahmen wurde nicht verarbeitet")
	}
	var ce *CloseError
	if !errors.As(err, &ce) {
		t.Fatalf("Fehler = %v, erwartet CloseError", err)
	}
	if ce.Code != 0 {
		t.Errorf("Code = %d, erwartet 0 (kein Code)", ce.Code)
	}
}

// TestInvalidCloseCodeIsRejected prueft einen reservierten Close-Code.
func TestInvalidCloseCodeIsRejected(t *testing.T) {
	server, client := paar(t)
	go func() {
		payload := []byte{0x03, 0xEC} // 1004 ist reserviert
		_, _ = client.conn.Write(rohrahmen(t, OpClose, payload, true, true))
	}()
	_, _, err := server.ReadMessage()
	var ce *CloseError
	if !errors.As(err, &ce) || ce.Code != CloseProtocolError {
		t.Fatalf("Fehler = %v, erwartet CloseError 1002", err)
	}
}

// ---- Ping und Pong ---------------------------------------------------------

// TestPingIsAnsweredWithPong prueft Pflicht aus RFC 6455 §5.5.3: ein Ping
// wird mit einem Pong derselben Nutzlast beantwortet.
func TestPingIsAnsweredWithPong(t *testing.T) {
	server, client := paar(t)
	if err := client.conn.SetReadDeadline(time.Now().Add(3 * time.Second)); err != nil {
		t.Fatalf("Frist nicht setzbar: %v", err)
	}
	go func() { _ = client.WriteMessage(OpPing, []byte("herzschlag")) }()
	// Der Ping muss gelesen werden, damit der Pong entsteht.
	go func() { _, _, _ = server.ReadMessage() }()

	// Der Pong kommt, ohne dass ReadMessage zurueckkehrt.
	f, err := readFrame(client.br, false, 0)
	if err != nil {
		t.Fatalf("kein Pong: %v", err)
	}
	if f.opcode != OpPong {
		t.Fatalf("Opcode = %d, erwartet Pong", f.opcode)
	}
	if string(f.payload) != "herzschlag" {
		t.Errorf("Nutzlast = %q, erwartet %q", f.payload, "herzschlag")
	}
}

// TestPongInvokesOnPong prueft, dass ein eingehender Pong den Herzschlag
// zuruecksetzt — das ist die Grundlage jeder Ueberwachung toter Clients.
func TestPongInvokesOnPong(t *testing.T) {
	server, client := paar(t)
	gerufen := make(chan struct{}, 1)
	server.OnPong = func() { rufen(gerufen) }

	fertig := make(chan struct{})
	go func() {
		// ReadMessage muss laufen, damit der Pong gelesen und gemeldet wird.
		_, _, _ = server.ReadMessage()
		close(fertig)
	}()
	if err := client.WriteMessage(OpPong, []byte("ok")); err != nil {
		t.Fatalf("Schreiben: %v", err)
	}

	select {
	case <-gerufen:
	case <-time.After(2 * time.Second):
		t.Fatal("OnPong wurde nicht gerufen")
	}
	_ = client.conn.Close()
	<-fertig
}

// TestPingBetweenFragmentsIsAnswered prueft, dass eine Steuernachricht
// waehrend einer Fragmentierung beantwortet wird (RFC 6455 §5.4).
func TestPingBetweenFragmentsIsAnswered(t *testing.T) {
	server, client := paar(t)
	go func() {
		_, _ = client.conn.Write(rohrahmen(t, OpText, []byte("teil1"), false, true))
		_, _ = client.conn.Write(rohrahmen(t, OpPing, []byte("dazwischen"), true, true))
		_, _ = client.conn.Write(rohrahmen(t, OpContinuation, []byte("teil2"), true, true))
	}()

	fertig := make(chan string, 1)
	go func() {
		_, payload, err := server.ReadMessage()
		if err != nil {
			fertig <- "FEHLER"
			return
		}
		fertig <- string(payload)
	}()

	f, err := readFrame(client.br, false, 0)
	if err != nil {
		t.Fatalf("kein Pong: %v", err)
	}
	if f.opcode != OpPong || string(f.payload) != "dazwischen" {
		t.Fatalf("Antwort = opcode %d, %q", f.opcode, f.payload)
	}
	select {
	case got := <-fertig:
		if got != "teil1teil2" {
			t.Fatalf("Nachricht = %q, erwartet teil1teil2", got)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("die fragmentierte Nachricht kam nicht an")
	}
}

// TestOversizedControlFrameIsRejected prueft die Grenze von 125 Bytes fuer
// Steuernachrichten.
func TestOversizedControlFrameIsRejected(t *testing.T) {
	server, client := paar(t)
	fertig := make(chan error, 1)
	go func() {
		_, _, err := server.ReadMessage()
		fertig <- err
	}()
	// Eine zu grosse Steuernachricht von Hand bauen: encodeFrame lehnt sie
	// selbst schon ab, deshalb geht der Rahmen roh auf die Leitung.
	zuGross := make([]byte, 0, 8+126)
	zuGross = append(zuGross, 0x80|OpPing, 126)
	zuGross = append(zuGross, 0, 126)
	zuGross = append(zuGross, 0, 0, 0, 0)
	zuGross = append(zuGross, bytes.Repeat([]byte{'p'}, 126)...)
	if _, err := client.conn.Write(zuGross); err != nil {
		t.Fatalf("Schreiben: %v", err)
	}
	var err error
	select {
	case err = <-fertig:
	case <-time.After(3 * time.Second):
		t.Fatal("die zu grosse Steuernachricht wurde nicht beanstandet")
	}
	var ce *CloseError
	if !errors.As(err, &ce) || ce.Code != CloseProtocolError {
		t.Fatalf("Fehler = %v, erwartet CloseError 1002", err)
	}
	if _, err := encodeFrame(OpPing, bytes.Repeat([]byte{'p'}, 126), true, false); err == nil {
		t.Error("encodeFrame muss eine zu grosse Steuernachricht ablehnen")
	}
	if _, err := encodeFrame(OpClose, []byte("x"), false, false); err == nil {
		t.Error("encodeFrame muss eine fragmentierte Steuernachricht ablehnen")
	}
}

// ---- Nebenlaeufiges Schreiben ---------------------------------------------

// TestConcurrentWritesDoNotInterleave prueft, dass parallele Schreiber keine
// Rahmen verschraenken: jede Nachricht kommt vollstaendig und unversehrt an.
func TestConcurrentWritesDoNotInterleave(t *testing.T) {
	server, client := paar(t)

	const schreiber = 8
	const je = 20
	var wg sync.WaitGroup
	for i := 0; i < schreiber; i++ {
		wg.Add(1)
		go func(n int) {
			defer wg.Done()
			text := strings.Repeat(string(rune('A'+n)), 200)
			for j := 0; j < je; j++ {
				if err := client.WriteMessage(OpText, []byte(text)); err != nil {
					return
				}
			}
		}(i)
	}

	gesehen := make(chan int, schreiber*je)
	go func() {
		for {
			_, payload, err := server.ReadMessage()
			if err != nil {
				close(gesehen)
				return
			}
			gesehen <- len(payload)
		}
	}()

	fertig := make(chan struct{})
	go func() { wg.Wait(); close(fertig) }()

	anzahl := 0
	frist := time.After(10 * time.Second)
	for {
		select {
		case n, ok := <-gesehen:
			if !ok {
				t.Fatalf("nur %d von %d Nachrichten kamen an", anzahl, schreiber*je)
			}
			if n != 200 {
				t.Fatalf("Nachricht %d hat %d Bytes, erwartet 200 — Rahmen verschraenkt", anzahl, n)
			}
			anzahl++
			if anzahl == schreiber*je {
				return
			}
		case <-frist:
			t.Fatalf("nur %d Nachrichten in 10s (erwartet %d)", anzahl, schreiber*je)
		}
	}
}

// ---- Handschlag ------------------------------------------------------------

// TestAcceptKeyMatchesRFC prueft den Accept-Schluessel gegen das Beispiel aus
// RFC 6455 §1.3.
func TestAcceptKeyMatchesRFC(t *testing.T) {
	got := AcceptKey("dGhlIHNhbXBsZSBub25jZQ==")
	if got != "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=" {
		t.Fatalf("Accept = %q, erwartet s3pPLMBiTxaQ9kYGzzhZRbK+xOo=", got)
	}
}

// TestAcceptRejectsBadHandshake prueft die Ablehnungen des Handschlags.
func TestAcceptRejectsBadHandshake(t *testing.T) {
	faelle := []struct {
		name   string
		mutate func(*http.Request)
	}{
		{"ohne Connection", func(r *http.Request) { r.Header.Del("Connection") }},
		{"ohne Upgrade", func(r *http.Request) { r.Header.Set("Upgrade", "h2c") }},
		{"falsche Version", func(r *http.Request) { r.Header.Set("Sec-WebSocket-Version", "8") }},
		{"ohne Schluessel", func(r *http.Request) { r.Header.Del("Sec-WebSocket-Key") }},
	}
	for _, fall := range faelle {
		req := &http.Request{
			Method: http.MethodGet,
			Header: http.Header{
				"Connection":            []string{"Upgrade"},
				"Upgrade":               []string{"websocket"},
				"Sec-WebSocket-Version": []string{"13"},
				"Sec-WebSocket-Key":     []string{"dGhlIHNhbXBsZSBub25jZQ=="},
			},
		}
		fall.mutate(req)
		if _, err := Accept(&nichtUebernehmbar{}, req); err == nil {
			t.Errorf("%s: Handschlag wurde angenommen", fall.name)
		}
	}
}

// nichtUebernehmbar ist ein ResponseWriter ohne Hijack: die Handschlagpruefung
// muss vor dem Uebernehmen der Verbindung scheitern.
type nichtUebernehmbar struct{}

func (nichtUebernehmbar) Header() http.Header         { return http.Header{} }
func (nichtUebernehmbar) Write(b []byte) (int, error) { return len(b), nil }
func (nichtUebernehmbar) WriteHeader(int)             {}

// rufen ruft f auf und meldet es ueber den Kanal; ein blockierender Aufruf darf
// den Test nicht anhalten.
func rufen(ch chan struct{}) {
	select {
	case ch <- struct{}{}:
	default:
	}
}

// dieneAlsEcho ist ein kleiner Server fuer Handschlagstests ueber TCP.
func dieneAlsEcho(t *testing.T, anzahl int) net.Listener {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("kein Port: %v", err)
	}
	t.Cleanup(func() { _ = ln.Close() })
	go func() {
		conn, err := ln.Accept()
		if err != nil {
			return
		}
		br := bufio.NewReader(conn)
		req, err := http.ReadRequest(br)
		if err != nil {
			_ = conn.Close()
			return
		}
		// Antwort direkt schreiben, damit der Test den echten Draht prueft.
		antwort := "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\n" +
			"Connection: Upgrade\r\nSec-WebSocket-Accept: " +
			AcceptKey(req.Header.Get("Sec-WebSocket-Key")) + "\r\n\r\n"
		if _, err := io.WriteString(conn, antwort); err != nil {
			_ = conn.Close()
			return
		}
		server := newConn(conn, br, true)
		for i := 0; i < anzahl; i++ {
			opcode, payload, err := server.ReadMessage()
			if err != nil {
				return
			}
			if err := server.WriteMessage(opcode, payload); err != nil {
				return
			}
		}
	}()
	return ln
}
