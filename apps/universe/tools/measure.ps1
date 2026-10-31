param(
  [string]$Url = 'http://127.0.0.1:3081/universe/?room=measure',
  [int]$Port = 9223,
  [int]$Warte = 3000
)

$ErrorActionPreference = 'Stop'
# Der Pfad wird **uebergeben**, nicht aus `$PSScriptRoot` gelesen: das Skript wird als
# `pwsh -Command` ausgefuehrt (die Ausfuehrungsrichtlinie verbietet `-File`), und dort ist
# `$PSScriptRoot` leer — ein Fehler, der wie ein fehlender Parameter aussieht.
$jsPfad = if ($PSScriptRoot) { Join-Path $PSScriptRoot 'measure.js' } else { Join-Path (Get-Location) 'snapshots\web\tools\measure.js' }
$js = Get-Content -Raw $jsPfad

function Verbinde([string]$ws) {
  $client = [System.Net.WebSockets.ClientWebSocket]::new()
  $client.ConnectAsync([uri]$ws, [Threading.CancellationToken]::None).Wait()
  return $client
}

function Rufe($client, [int]$id, [string]$method, $params) {
  $json = @{ id = $id; method = $method; params = $params } | ConvertTo-Json -Depth 8 -Compress
  $bytes = [Text.Encoding]::UTF8.GetBytes($json)
  $seg = [ArraySegment[byte]]::new($bytes)
  $client.SendAsync($seg, [System.Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None).Wait()
  for ($i = 0; $i -lt 60; $i++) {
    $buffer = New-Object byte[] 524288
    $s = [ArraySegment[byte]]::new($buffer)
    $sb = [Text.StringBuilder]::new()
    do {
      $res = $client.ReceiveAsync($s, [Threading.CancellationToken]::None).Result
      $null = $sb.Append([Text.Encoding]::UTF8.GetString($buffer, 0, $res.Count))
    } while (-not $res.EndOfMessage)
    $obj = $sb.ToString() | ConvertFrom-Json
    if ($obj.id -eq $id) { return $obj }
  }
  return $null
}

# Eine frische Seite aufmachen und warten, bis sie gebaut ist.
$neu = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/json/new?$Url" -Method Put -UseBasicParsing -TimeoutSec 10
$ziel = $neu.Content | ConvertFrom-Json
$client = Verbinde $ziel.webSocketDebuggerUrl
$null = Rufe $client 1 'Runtime.enable' @{}

# **Die Fenstergroesse wird gesetzt, nicht erfragt.**
#
# `--window-size` beim Start wird im kopflosen Betrieb nicht zuverlaessig uebernommen: die Seite
# bekam **764 px** Breite. Das ist unter der Handy-Grenze (860 px), und dort schaltet die Huelle
# **absichtlich** auf Chat um — die Welt braucht Platz. Die Messung sah deshalb „0 Beschriftungen"
# und haette den Fehler in der Messung fuer einen Fehler im Code gehalten.
#
# `Emulation.setDeviceMetricsOverride` setzt Breite, Hoehe und Geraetepixel direkt.
$null = Rufe $client 3 'Emulation.setDeviceMetricsOverride' @{
  width = 1440
  height = 900
  deviceScaleFactor = 1
  mobile = $false
}
Start-Sleep -Milliseconds $Warte

# **`awaitPromise` ist Pflicht, wenn das Messskript auf etwas wartet.**
#
# Das Skript wartet auf den naechsten Bildlauf (`requestAnimationFrame`), weil Positionen und Tiefe
# der Beschriftungen erst dort entstehen. Ohne `awaitPromise` liefert die Auswertung das
# Promise-Objekt selbst zurueck — und `value` daran ist leer. Das sah aus wie „keine Antwort",
# obwohl die Seite ein Ergebnis hatte.
$antwort = Rufe $client 2 'Runtime.evaluate' @{
  expression = $js
  returnByValue = $true
  awaitPromise = $true
}

if ($antwort -and $antwort.result -and $antwort.result.result -and $antwort.result.result.value) {
  Write-Host $antwort.result.result.value
} else {
  Write-Host '--- KEIN ERGEBNIS ---'
  Write-Host ($antwort | ConvertTo-Json -Depth 8)
}

$client.Dispose()
