param(
  [string]$Url = 'http://127.0.0.1:3081/universe/?room=measure',
  [int]$Port = 9223,
  [int]$Warte = 3500,
  [string]$Ziel = "$PSScriptRoot\shot.png"
)

$ErrorActionPreference = 'Stop'

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
  for ($i = 0; $i -lt 80; $i++) {
    $buffer = New-Object byte[] 8388608
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

$neu = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/json/new?$Url" -Method Put -UseBasicParsing -TimeoutSec 10
$seite = $neu.Content | ConvertFrom-Json
$client = Verbinde $seite.webSocketDebuggerUrl
$null = Rufe $client 1 'Runtime.enable' @{}
$null = Rufe $client 2 'Emulation.setDeviceMetricsOverride' @{ width = 1440; height = 900; deviceScaleFactor = 1; mobile = $false }
Start-Sleep -Milliseconds $Warte

# In die Welt schalten — über die Insel, wie ein Nutzer.
$js = @'
(() => {
  const ruf = (el, typ) => { if (el) el.dispatchEvent(new MouseEvent(typ, { bubbles: true, cancelable: true })); };
  const mini = document.querySelector('#isl .mini') || document.querySelector('#islMini');
  ruf(mini, 'click');
  const welt = [...document.querySelectorAll('#isl .isitem')].find((e) => e.dataset.action === 'os');
  ruf(welt, 'click');
  return 'geklickt';
})()
'@
$null = Rufe $client 3 'Runtime.evaluate' @{ expression = $js; returnByValue = $true }
Start-Sleep -Milliseconds 1500

$schuss = Rufe $client 4 'Page.captureScreenshot' @{ format = 'png' }
if ($schuss -and $schuss.result -and $schuss.result.data) {
  [IO.File]::WriteAllBytes($Ziel, [Convert]::FromBase64String($schuss.result.data))
  Write-Host "Bild geschrieben: $Ziel  ($((Get-Item $Ziel).Length) B)"
} else {
  Write-Host '--- KEIN BILD ---'
  Write-Host ($schuss | ConvertTo-Json -Depth 6)
}

$client.Dispose()
