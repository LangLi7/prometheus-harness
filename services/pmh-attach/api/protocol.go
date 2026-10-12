// Package api haelt den Protokollvertrag des Anhaengepunkts `pmh-attach`:
// die Rahmennamen, Endpunktnamen, Fehlercodes und die Nachrichtentypen in
// beide Richtungen.
//
// # Herkunft der Namen
//
// Der Vertrag ist bewusst zweigeteilt:
//
//   - Woertlich uebernommen ist alles, was im Core-Gateway-Seam nachweisbar
//     ist (Vorlage, nur gelesen):
//     packages/api/gateway/src/stream-protocol.ts,
//     packages/api/gateway/src/remote-error-codes.ts,
//     packages/typert/protocol/src/types.ts,
//     packages/api/gateway/src/stream-server.ts.
//     Betroffen sind die Rahmennamen item, end, cancel, error, open, ready,
//     emit, waterfall, die Endpunkte $events und $events/result, der Mux-Pfad
//     /api/remote.mux, die Fehlercodes mit Praefix gateway/ und die
//     Close-Codes 1001, 1003, 1008, 1011.
//   - Eigene Ergaenzungen sind alles, was der Core nicht kennt: attach,
//     detach, resync, snapshot, event, die Sequenznummer, das Feld droppable
//     und die Close-Codes 1007 und 1012. Sie sind hier und in der README als
//     eigene Namen gekennzeichnet.
//
// Der Grund fuer diese Trennung steht in docs/concept.md (Regel 2: keine
// Interna) und in docs/decisions/hybrid-then-self-build.md §5: der TS-Seam
// darf nicht zwei Semantiken kennen.
package api

import (
	"encoding/json"
	"strings"
)

// ---------------------------------------------------------------------------
// Feste Namen des Core-Gateway-Seams — woertlich
// ---------------------------------------------------------------------------

const (
	// MuxPath ist der exakte WebSocket-Pfad, der im Core alle Typert-Remote-
	// Streams traegt (REMOTE_STREAM_MUX_PATH).
	//
	// pmh-attach fuehrt diesen Pfad NICHT, damit kein zweiter Dienst
	// dieselbe Route beansprucht. Der Name steht hier nur als Beleg und fuer
	// einen moeglichen spaeteren Upstream-Anschluss.
	MuxPath = "/api/remote.mux"

	// AttachPath ist unser eigener Pfad des Anhaengepunkts. Der Core kennt
	// ihn nicht; er ist bewusst von MuxPath verschieden.
	AttachPath = "/v1/attach"

	// HealthPath ist unser eigener Lebendigkeitspfad.
	HealthPath = "/healthz"

	// EventsPath ist unser eigener Pfad des Upstream-Stroms (NDJSON). Der
	// Name lehnt sich an den Core-Endpunkt EventsEndpoint an, ist aber eine
	// eigene Route.
	EventsPath = "/v1/events"

	// EventsEndpoint ist der Core-interne logische Endpunkt, der die vom
	// Anwendungsprogramm ausgewaehlten Cordis-Ereignisse traegt
	// (REMOTE_EVENT_STREAM_ENDPOINT).
	EventsEndpoint = "$events"

	// EventResultEndpoint ist der Core-interne unare Endpunkt, der das
	// Ergebnis eines Client-Remote-Ereignisses zuruecknimmt
	// (REMOTE_EVENT_RESULT_ENDPOINT).
	EventResultEndpoint = "$events/result"
)

// Rahmennamen der logischen Streams — woertlich aus dem Core.
//
// Clientsicht (RemoteStreamClientMessage): Open, Item, End, Cancel.
// Hostsicht (RemoteStreamServerMessage): Item, Error, End.
// Ereignissicht (RemoteEventDownlinkFrame): Ready, Emit, Waterfall, Cancel.
const (
	FrameOpen      = "open"
	FrameItem      = "item"
	FrameEnd       = "end"
	FrameCancel    = "cancel"
	FrameError     = "error"
	FrameReady     = "ready"
	FrameEmit      = "emit"
	FrameWaterfall = "waterfall"
)

// Eigene Rahmennamen. Der Core kennt sie nicht; sie stehen hier, weil der
// Anhaengepunkt einen eigenen Lebenslauf (an-, ab-, nachhaengen) und eine
// eigene Sicht (Ansicht plus Fenster) braucht.
const (
	FrameAttach   = "attach"
	FrameDetach   = "detach"
	FrameResync   = "resync"
	FrameSnapshot = "snapshot"
	FrameEvent    = "event"
)

// Fehlercodes — woertlich aus dem Core-Fehlerwoerterbuch.
//
// Die universellen Traegercodes stehen in dsh-typert-protocol/src/types.ts
// (RemoteErrorDetailsMap), die Gateway-Codes in
// dsh-api-gateway/src/remote-error-codes.ts. Die Liste hier ist die Teilmenge,
// die pmh-attach wirklich senden kann; die kurzen Kommentare nennen jeweils
// die Stelle, an der pmh-attach sie wirft.
const (
	// CodeBadRequest — der Aufrufer hat die Anfrage verletzt (hier: das
	// attach-Fenster war leer oder zu lang).
	CodeBadRequest = "gateway/bad-request"

	// CodeCancelled — der Aufruf wurde abgebrochen (hier: der Upstream
	// wurde waehrend des Anhaengens abgebaut).
	CodeCancelled = "gateway/cancelled"

	// CodeInternal — Traeger-, Dispatch- oder unklassifizierter Fehler
	// (hier: der Upstream ist nicht erreichbar).
	CodeInternal = "gateway/internal"

	// CodeProtocol — Verletzung des Strom-Protokolls (hier: Anhaengen ohne
	// Attach-Rahmen, doppeltes Anhaengen, ein zweites attach auf derselben
	// Verbindung).
	CodeProtocol = "gateway/protocol"

	// CodeInputInvalid — ein Uplink-Element wurde abgewiesen (hier: der
	// Eingaberahmen trug kein JSON-taugliches Feld).
	CodeInputInvalid = "gateway/input-invalid"

	// CodeUplinkOverflow — der gepufferte Uplink hat die Grenze
	// ueberschritten (hier: die Sicht ist nicht angeschlossen, der
	// Eingabepuffer lief voll).
	CodeUplinkOverflow = "gateway/uplink-overflow"

	// CodeServiceUnavailable — der Dienst hinter dem Endpunkt ist nicht
	// verfuegbar (hier: der Upstream antwortet nicht oder nicht mit 200).
	CodeServiceUnavailable = "gateway/service-unavailable"

	// CodePeerLagged — unser eigener Code fuer den langsamen Client, der
	// getrennt werden musste. Der Core kennt diese Trennung nicht; er kennt
	// nur den vollen Uplink-Puffer (uplink-overflow) und ueberlaesst die
	// Downlink-Ueberlast dem Client.
	CodePeerLagged = "attach/peer-lagged"

	// CodeUpstreamGone — unser eigener Code fuer einen Upstream-Strom, der
	// waehrend des Betriebs endet. Sichtbar, nicht still (docs/concept.md
	// Regel 3).
	CodeUpstreamGone = "attach/upstream-gone"
)

// Close-Codes nach RFC 6455 §7.4.1.
//
// 1001, 1003, 1008 und 1011 verwendet der Core-Gateway-Seam (stream-server.ts)
// woertlich; 1007 und 1012 sind unsere eigenen Ergaenzungen erlaubter
// Standard-Codes (ungueltige Nutzlast, Dienst-Neustart).
const (
	CloseGoingAway      = 1001
	CloseTextRequired   = 1003
	CloseInvalidPayload = 1007
	ClosePolicyViolated = 1008
	CloseInternalError  = 1011
	CloseServiceRestart = 1012
)

// ---------------------------------------------------------------------------
// Nachrichten der Clientsicht — Richtung UI zum Anhaengepunkt
// ---------------------------------------------------------------------------

// ClientMessage ist der Umschlag eines Rahmens der Clientsicht. Ausgewertet
// wird immer nur das Feld Type; die uebrigen Felder sind eine flache
// Vereinigung, damit die JSON-Form dem Core-Rahmen entspricht (der Core
// erlaubt ebenfalls keine zusaetzlichen Felder, siehe exactKeys()).
type ClientMessage struct {
	// Type ist einer der Rahmennamen FrameAttach, FrameItem, FrameEnd,
	// FrameCancel, FrameDetach, FrameResync.
	Type string `json:"type"`

	// StreamID identifiziert den logischen Strom. Traegt die Clientsicht
	// woertlich (streamId); pmh-attach erlaubt ihn optional, weil eine
	// Verbindung genau eine Anhaengung traegt.
	StreamID string `json:"streamId,omitempty"`

	// Endpoint ist der logische Endpunkt des Core-Rahmens open. pmh-attach
	// belegt ihn mit dem Ansichtsnamen (view).
	Endpoint string `json:"endpoint,omitempty"`

	// Payload ist die Nutzlast des Core-Rahmens open. pmh-attach legt die
	// Anhaengung hinein.
	Payload *AttachPayload `json:"payload,omitempty"`

	// Value ist die Nutzlast des Core-Rahmens item (Client-Eingabe).
	Value json.RawMessage `json:"value,omitempty"`

	// FromSeq ist unsere Ergaenzung fuer den Rahmen resync: die letzte
	// Sequenznummer, die der Client gesehen hat.
	FromSeq uint64 `json:"fromSeq,omitempty"`
}

// AttachPayload ist unsere eigene Ergaenzung: sie beschreibt, was angehaengt
// wird. Der Core kennt keine Ansicht und kein Fenster.
type AttachPayload struct {
	// View ist die deklarierte Sicht: session, terminal, graph oder files.
	View string `json:"view"`

	// WindowID ist das Fenster bzw. Panel, das diese Verbindung darstellt.
	WindowID string `json:"windowId"`
}

// ---------------------------------------------------------------------------
// Nachrichten der Hostsicht — Richtung Anhaengepunkt zur UI
// ---------------------------------------------------------------------------

// ServerMessage ist der Umschlag eines Rahmens der Hostsicht.
type ServerMessage struct {
	Type string `json:"type"`

	// StreamID und Seq tragen Attach-Eintrag und Sequenznummer. Der Core
	// traegt streamId woertlich; Seq ist unsere Ergaenzung zur
	// Lueckenerkennung.
	StreamID string `json:"streamId,omitempty"`
	Seq      uint64 `json:"seq,omitempty"`

	// View und WindowID wiederholen die Anhaengung im ready-Rahmen.
	View     string `json:"view,omitempty"`
	WindowID string `json:"windowId,omitempty"`

	// FromSeq ist der Stand, ab dem ein Snapshot gilt.
	FromSeq uint64 `json:"fromSeq,omitempty"`

	// Gap zeigt an, dass zwischen FromSeq und Seq mindestens ein Rahmen
	// fehlt, den der Server nicht mehr nachliefern kann.
	Gap bool `json:"gap,omitempty"`

	// Messages ist unser eigener Rahmen snapshot. Der Core kennt keinen
	// vollen Zustand; er deckt Luecken ueber die Fachschicht ab
	// (RemoteJournalStream).
	Messages []EventFrame `json:"messages,omitempty"`

	// Event, Args, Droppable, Value, Error gehoeren zu den Rahmen event,
	// item und error.
	Event     string          `json:"event,omitempty"`
	Args      json.RawMessage `json:"args,omitempty"`
	Value     json.RawMessage `json:"value,omitempty"`
	Droppable bool            `json:"droppable,omitempty"`
	Error     *Failure        `json:"error,omitempty"`
}

// EventFrame ist ein Ereignis im vollen Zustand (Rahmen snapshot). Die
// Feldnamen streamId, event und args sind woertlich; value und droppable sind
// unsere Ergaenzungen.
type EventFrame struct {
	StreamID  string          `json:"streamId"`
	Seq       uint64          `json:"seq"`
	Event     string          `json:"event,omitempty"`
	Args      json.RawMessage `json:"args,omitempty"`
	Value     json.RawMessage `json:"value,omitempty"`
	Droppable bool            `json:"droppable,omitempty"`
}

// Failure ist die Fehlernutzlast eines error-Rahmens. Die Feldnamen code,
// message und details sind woertlich (RemoteStreamFailure).
type Failure struct {
	Code    string         `json:"code"`
	Message string         `json:"message"`
	Details map[string]any `json:"details"`
}

// NewFailure baut einen Fehler mit nicht-leeren Details — der Core-Rahmen
// verlangt ein Objekt, nie null.
func NewFailure(code, message string, details map[string]any) *Failure {
	if details == nil {
		details = map[string]any{}
	}
	return &Failure{Code: code, Message: message, Details: details}
}

// ---------------------------------------------------------------------------
// Upstream-Ereignis (NDJSON-Zeile des Upstream-Stroms)
// ---------------------------------------------------------------------------

// UpstreamEvent ist ein Ereignis, das aus dem Upstream-Strom gelesen wird. Die
// Felder event und args sind woertlich (RemoteEventEmitFrame); value,
// droppable und seq sind unsere Ergaenzungen.
type UpstreamEvent struct {
	Event     string          `json:"event"`
	Args      json.RawMessage `json:"args,omitempty"`
	Value     json.RawMessage `json:"value,omitempty"`
	Droppable bool            `json:"droppable,omitempty"`
}

// ---------------------------------------------------------------------------
// Auswertung
// ---------------------------------------------------------------------------

// ParseClientMessage wertet einen Text-Rahmen der Clientsicht aus. Ein Fehler
// bedeutet: der Rahmen ist kein gueltiges JSON-Objekt oder verletzt den
// Vertrag. Der Aufrufer schliesst daraufhin mit ClosePolicyViolated — genau
// wie der Core bei einem ungueltigen Remote-Stream-Rahmen.
func ParseClientMessage(text string) (ClientMessage, error) {
	var m ClientMessage
	dec := json.NewDecoder(strings.NewReader(text))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&m); err != nil {
		return ClientMessage{}, err
	}
	if err := m.validate(); err != nil {
		return ClientMessage{}, err
	}
	return m, nil
}

func (m ClientMessage) validate() error {
	switch m.Type {
	case FrameAttach:
		if m.Endpoint == "" {
			return errProtocol("attach ohne endpoint (Ansicht)")
		}
		if m.Payload == nil || m.Payload.WindowID == "" {
			return errProtocol("attach ohne payload.windowId")
		}
		if len(m.Endpoint) > MaxViewLen {
			return errProtocol("Ansicht ist zu lang")
		}
		if len(m.Payload.WindowID) > MaxWindowIDLen {
			return errProtocol("Fensterkennung ist zu lang")
		}
	case FrameItem, FrameEnd, FrameCancel, FrameDetach:
		// Der Core laesst diese Rahmen ohne weitere Felder zu.
	case FrameResync:
		// fromSeq darf fehlen; es bedeutet dann "alles, was du hast".
	default:
		return errProtocol("unbekannter Rahmentyp " + m.Type)
	}
	return nil
}

// ProtocolError ist der Fehler eines ungueltigen Rahmens; der Aufrufer
// unterscheidet ihn nicht von anderen Auswertungsfehlern, aber Tests und
// Protokoll koennen ihn benennen.
type ProtocolError struct{ msg string }

func (e *ProtocolError) Error() string { return "pmh-attach: " + e.msg }

func errProtocol(msg string) error { return &ProtocolError{msg: msg} }

// IstClientRahmen meldet, ob der Text ein Rahmen der Clientsicht ist. Ein
// Ereignis des Upstream-Stroms traegt type "event" und wird nicht als
// Client-Rahmen gewertet.
func IstClientRahmen(text string) bool {
	if !json.Valid([]byte(text)) {
		return false
	}
	var probe struct {
		Type string `json:"type"`
	}
	if err := json.Unmarshal([]byte(text), &probe); err != nil {
		return false
	}
	return probe.Type != FrameEvent && probe.Type != ""
}

// Grenzen des Vertrags. Sie sind Vorgaben, keine Geheimnisse: die README
// nennt sie.
const (
	// MaxViewLen ist die laengste erlaubte Ansicht.
	MaxViewLen = 32
	// MaxWindowIDLen ist die laengste erlaubte Fensterkennung.
	MaxWindowIDLen = 128
	// MaxFrameBytes ist die Obergrenze einer eingehenden Nachricht.
	MaxFrameBytes = 1 << 20
)
