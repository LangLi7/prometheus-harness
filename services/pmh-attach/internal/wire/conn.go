package wire

import (
	"bufio"
	"crypto/rand"
	"crypto/sha1"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

// GUID ist der im RFC 6455 §1.3 festgelegte Wert fuer den Accept-Schluessel.
const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

// HandshakeTimeout begrenzt das Warten auf den Handschlag.
const HandshakeTimeout = 10 * time.Second

// Conn ist eine WebSocket-Verbindung. Lesen und Schreiben sind getrennt
// nebenlaeufig sicher: das Schreiben wird durch einen Mutex serialisiert,
// damit Rahmen nie verschraenkt werden.
type Conn struct {
	conn net.Conn
	br   *bufio.Reader

	writeMu sync.Mutex
	// fragmented zerlegt grosse Nachrichten in mehrere Rahmen. 0 heisst: eine
	// Nachricht geht als ein Rahmen auf die Leitung.
	fragmented int

	// nextMask sagt, ob die Gegenstelle maskieren muss. Fuer einen Server
	// (Client maskiert) ist das true, fuer einen Client false.
	nextMask bool
	// maskOut sagt, ob dieser Teilnehmer selbst maskiert: der Client tut es.
	maskOut bool

	closeMu   sync.Mutex
	closeSent bool

	// OnPong wird bei jedem empfangenen Pong gerufen (Herzschlag).
	OnPong func()
}

// newConn baut die Verbindung um einen bereits ausgehandelten Socket.
func newConn(c net.Conn, br *bufio.Reader, server bool) *Conn {
	return &Conn{
		conn:       c,
		br:         br,
		nextMask:   server,
		maskOut:    !server,
		fragmented: 1 << 16,
	}
}

// SetFragmented setzt die Groesse, ab der eine Nachricht in mehrere Rahmen
// zerlegt wird. n <= 0 schaltet die Zerlegung ab.
func (c *Conn) SetFragmented(n int) {
	c.writeMu.Lock()
	c.fragmented = n
	c.writeMu.Unlock()
}

// NewClientConn baut die Clientseite um einen bereits ausgehandelten Socket:
// der Client maskiert seine Rahmen und verlangt unmaskierte Antworten
// (RFC 6455 §5.3). Exportiert, damit Tests den Draht aus beiden Rollen
// pruefen koennen.
func NewClientConn(c net.Conn) *Conn { return newConn(c, bufio.NewReader(c), false) }

// NewServerConn baut die Serverseite um einen bereits ausgehandelten Socket.
// Exportiert aus demselben Grund wie NewClientConn.
func NewServerConn(c net.Conn) *Conn { return newConn(c, bufio.NewReader(c), true) }

// RemoteAddr liefert die Adresse der Gegenstelle.
func (c *Conn) RemoteAddr() net.Addr { return c.conn.RemoteAddr() }

// SetReadDeadline setzt die Lesefrist; die Nullzeit hebt sie auf.
func (c *Conn) SetReadDeadline(t time.Time) error { return c.conn.SetReadDeadline(t) }

// Accept fuehrt den Serverhandschlag aus. Der Aufruf uebernimmt den Socket aus
// dem HTTP-Handler (Hijack) und schreibt die 101-Antwort. Fehlerhafte
// Handschlaege werden mit einer HTTP-Antwort abgewiesen, nicht mit einem
// offenen Socket.
func Accept(w http.ResponseWriter, r *http.Request) (*Conn, error) {
	if r.Method != http.MethodGet {
		http.Error(w, "WebSocket verlangt GET", http.StatusMethodNotAllowed)
		return nil, fmt.Errorf("wire: Handschlag mit Methode %s", r.Method)
	}
	if !headerContainsToken(r.Header, "Connection", "upgrade") {
		http.Error(w, "Connection: Upgrade fehlt", http.StatusBadRequest)
		return nil, errors.New("wire: Connection: Upgrade fehlt")
	}
	if !headerContainsToken(r.Header, "Upgrade", "websocket") {
		http.Error(w, "Upgrade: websocket fehlt", http.StatusBadRequest)
		return nil, errors.New("wire: Upgrade: websocket fehlt")
	}
	if v := r.Header.Get("Sec-WebSocket-Version"); v != "13" {
		w.Header().Set("Sec-WebSocket-Version", "13")
		http.Error(w, "Sec-WebSocket-Version 13 verlangt", http.StatusUpgradeRequired)
		return nil, fmt.Errorf("wire: Sec-WebSocket-Version %q", v)
	}
	key := r.Header.Get("Sec-WebSocket-Key")
	if key == "" {
		http.Error(w, "Sec-WebSocket-Key fehlt", http.StatusBadRequest)
		return nil, errors.New("wire: Sec-WebSocket-Key fehlt")
	}

	hijacker, ok := w.(http.Hijacker)
	if !ok {
		http.Error(w, "Verbindung nicht uebernehmbar", http.StatusInternalServerError)
		return nil, errors.New("wire: ResponseWriter kann die Verbindung nicht uebernehmen")
	}
	netConn, rw, err := hijacker.Hijack()
	if err != nil {
		return nil, fmt.Errorf("wire: Verbindung uebernehmen: %w", err)
	}

	resp := "HTTP/1.1 101 Switching Protocols\r\n" +
		"Upgrade: websocket\r\n" +
		"Connection: Upgrade\r\n" +
		"Sec-WebSocket-Accept: " + AcceptKey(key) + "\r\n\r\n"
	if _, err := io.WriteString(netConn, resp); err != nil {
		_ = netConn.Close()
		return nil, fmt.Errorf("wire: Handschlagantwort schreiben: %w", err)
	}
	br := rw.Reader
	if br == nil {
		br = bufio.NewReader(netConn)
	}
	return newConn(netConn, br, true), nil
}

// AcceptKey berechnet den Sec-WebSocket-Accept-Wert (RFC 6455 §4.2.2).
func AcceptKey(key string) string {
	sum := sha1.Sum([]byte(key + GUID))
	return base64.StdEncoding.EncodeToString(sum[:])
}

// headerContainsToken prueft einen Kopfzeilenwert auf ein Token, ohne
// Gross-/Kleinschreibung zu unterscheiden.
func headerContainsToken(h http.Header, name, token string) bool {
	for _, value := range h.Values(name) {
		for _, part := range strings.Split(value, ",") {
			if strings.EqualFold(strings.TrimSpace(part), token) {
				return true
			}
		}
	}
	return false
}

// Dial baut die Clientseite: TCP verbinden, Handschlag senden, Antwort pruefen.
// Die Funktion existiert, damit Tests genau den Draht pruefen, den ein Browser
// benutzt — kein Client wird im Betrieb gebraucht.
func Dial(rawURL string, header http.Header) (*Conn, error) {
	u, err := url.Parse(rawURL)
	if err != nil {
		return nil, err
	}
	if u.Scheme != "ws" && u.Scheme != "http" {
		return nil, fmt.Errorf("wire: Schema %q wird nicht unterstuetzt (nur ws)", u.Scheme)
	}
	addr := u.Host
	if u.Port() == "" {
		addr = net.JoinHostPort(u.Hostname(), "80")
	}
	netConn, err := net.DialTimeout("tcp", addr, HandshakeTimeout)
	if err != nil {
		return nil, err
	}
	keyBytes := make([]byte, 16)
	if _, err := rand.Read(keyBytes); err != nil {
		_ = netConn.Close()
		return nil, err
	}
	key := base64.StdEncoding.EncodeToString(keyBytes)

	req := &http.Request{
		Method:     http.MethodGet,
		URL:        u,
		Host:       u.Host,
		Proto:      "HTTP/1.1",
		ProtoMajor: 1,
		ProtoMinor: 1,
		Header:     http.Header{},
	}
	for k, v := range header {
		req.Header[k] = v
	}
	req.Header.Set("Connection", "Upgrade")
	req.Header.Set("Upgrade", "websocket")
	req.Header.Set("Sec-WebSocket-Version", "13")
	req.Header.Set("Sec-WebSocket-Key", key)
	if err := req.Write(netConn); err != nil {
		_ = netConn.Close()
		return nil, err
	}
	br := bufio.NewReader(netConn)
	resp, err := http.ReadResponse(br, req)
	if err != nil {
		_ = netConn.Close()
		return nil, err
	}
	if resp.StatusCode != http.StatusSwitchingProtocols {
		_ = resp.Body.Close()
		_ = netConn.Close()
		return nil, fmt.Errorf("wire: Handschlag abgelehnt: %s", resp.Status)
	}
	if got := resp.Header.Get("Sec-WebSocket-Accept"); got != AcceptKey(key) {
		_ = netConn.Close()
		return nil, fmt.Errorf("wire: Sec-WebSocket-Accept %q ist falsch", got)
	}
	return newConn(netConn, br, false), nil
}

// Close schliesst den Socket hart.
func (c *Conn) Close() error { return c.conn.Close() }

// ReadMessage liest die naechste vollstaendige Text- oder Binaernachricht.
// Fragmentierte Nachrichten werden zusammengesetzt, Steuernachrichten
// beantwortet. Ein Close der Gegenstelle kommt als *CloseError zurueck, das
// Ende der Leitung als io.EOF.
func (c *Conn) ReadMessage() (opcode byte, payload []byte, err error) {
	var (
		msgOpcode byte
		assembled []byte
		inMessage bool
	)
	for {
		f, err := readFrame(c.br, c.nextMask, 0)
		if err != nil {
			if errors.Is(err, errProtocolVerletzt) {
				c.sendClose(CloseProtocolError, "Protokoll verletzt")
				return 0, nil, &CloseError{Code: CloseProtocolError, Reason: err.Error()}
			}
			return 0, nil, err
		}
		if isControl(f.opcode) {
			if !f.fin || len(f.payload) > MaxControlPayload {
				c.sendClose(CloseProtocolError, "Steuernachricht verletzt RFC 6455")
				return 0, nil, &CloseError{Code: CloseProtocolError, Reason: "ungueltige Steuernachricht"}
			}
			switch f.opcode {
			case OpPing:
				// Pong muss dieselbe Nutzlast tragen (RFC 6455 §5.5.3).
				if err := c.writeFrame(OpPong, f.payload, true); err != nil {
					return 0, nil, err
				}
			case OpPong:
				if c.OnPong != nil {
					c.OnPong()
				}
			case OpClose:
				code, reason, derr := decodeClose(f.payload)
				if derr != nil {
					c.sendClose(CloseProtocolError, "ungueltige Close-Nutzlast")
					return 0, nil, &CloseError{Code: CloseProtocolError, Reason: derr.Error()}
				}
				// Close-Austausch: einmal zurueckschliessen, dann melden.
				c.sendClose(code, "")
				return 0, nil, &CloseError{Code: code, Reason: reason}
			}
			continue
		}

		switch f.opcode {
		case OpContinuation:
			if !inMessage {
				c.sendClose(CloseProtocolError, "Fortsetzung ohne Anfang")
				return 0, nil, &CloseError{Code: CloseProtocolError, Reason: "Fortsetzung ohne Anfang"}
			}
			assembled = append(assembled, f.payload...)
		case OpText, OpBinary:
			if inMessage {
				c.sendClose(CloseProtocolError, "neue Nachricht waehrend einer Fragmentierung")
				return 0, nil, &CloseError{Code: CloseProtocolError, Reason: "verschachtelte Nachricht"}
			}
			msgOpcode = f.opcode
			assembled = append([]byte(nil), f.payload...)
			inMessage = true
		default:
			c.sendClose(CloseProtocolError, "unbekannter Opcode")
			return 0, nil, &CloseError{Code: CloseProtocolError, Reason: "unbekannter Opcode"}
		}
		if f.fin {
			return msgOpcode, assembled, nil
		}
	}
}

// WriteMessage schreibt eine vollstaendige Nachricht, bei Bedarf in mehrere
// Rahmen zerlegt.
func (c *Conn) WriteMessage(opcode byte, payload []byte) error {
	c.writeMu.Lock()
	limit := c.fragmented
	c.writeMu.Unlock()

	if limit <= 0 || len(payload) <= limit {
		return c.writeFrame(opcode, payload, true)
	}
	// Erster Rahmen mit dem echten Opcode, danach Continuation-Rahmen.
	first := true
	for len(payload) > 0 {
		n := limit
		if n > len(payload) {
			n = len(payload)
		}
		chunk := payload[:n]
		payload = payload[n:]
		op := OpContinuation
		if first {
			op = opcode
			first = false
		}
		if err := c.writeFrame(op, chunk, len(payload) == 0); err != nil {
			return err
		}
	}
	return nil
}

// WriteText ist die Kurzform fuer Textnachrichten.
func (c *Conn) WriteText(text string) error { return c.WriteMessage(OpText, []byte(text)) }

// SendPing schickt einen Ping-Rahmen mit Nutzlast.
func (c *Conn) SendPing(payload string) error {
	return c.writeFrame(OpPing, []byte(payload), true)
}

// SendClose schliesst den Strom mit Code und Grund. Der Aufruf ist idempotent;
// ein zweiter Aufruf schreibt keinen weiteren Rahmen.
func (c *Conn) SendClose(code uint16, reason string) error { return c.sendClose(code, reason) }

func (c *Conn) sendClose(code uint16, reason string) error {
	c.closeMu.Lock()
	if c.closeSent {
		c.closeMu.Unlock()
		return nil
	}
	c.closeSent = true
	c.closeMu.Unlock()
	if code == 0 {
		return c.writeFrame(OpClose, nil, true)
	}
	return c.writeFrame(OpClose, encodeClose(code, truncateReason(reason)), true)
}

// CloseSent meldet, ob bereits ein Close-Rahmen geschrieben wurde.
func (c *Conn) CloseSent() bool {
	c.closeMu.Lock()
	defer c.closeMu.Unlock()
	return c.closeSent
}

// truncateReason kuerzt einen Close-Grund auf die Nutzlastgrenze.
func truncateReason(reason string) string {
	if len(reason) <= MaxControlPayload-2 {
		return reason
	}
	return reason[:MaxControlPayload-2]
}

// writeFrame schreibt genau einen Rahmen; der Mutex serialisiert parallele
// Schreiber.
func (c *Conn) writeFrame(opcode byte, payload []byte, fin bool) error {
	c.writeMu.Lock()
	defer c.writeMu.Unlock()
	buf, err := encodeFrame(opcode, payload, fin, c.maskOut)
	if err != nil {
		return err
	}
	_, err = c.conn.Write(buf)
	return err
}
