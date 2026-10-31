#!/usr/bin/env pwsh
#requires -Version 7.0
<#
.SYNOPSIS
  Prüft den Skill-Index gegen den tatsächlichen Bestand.

.DESCRIPTION
  Drei Prüfungen, jede kann rot werden:
    1. Abdeckung   — jeder Projekt-Skill kommt im Index oder in einem Katalog vor.
    2. Genauigkeit — kein Name im Index, den es nirgends gibt (Tippfehler, gelöschter Skill).
    3. Doppelung   — derselbe Name liegt in zwei Wurzeln (Rang entscheidet, wer gewinnt).

  Exitcode 1 heißt: der Index beschreibt nicht, was da ist.

.EXAMPLE
  pwsh -File .agents/skills/catalog/check.ps1
#>
[CmdletBinding()]
param(
  # Wurzel der Bibliothek; Vorgabe ist der Ordner über diesem Skript.
  [string]$SkillsRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,

  # Zusätzliche flache Wurzeln (direkte Kinder mit SKILL.md).
  [string[]]$ExtraRoots = @(),

  # Zusätzliche Baumwurzeln, in denen rekursiv nach SKILL.md gesucht wird.
  [string[]]$ExtraTrees = @(),

  # Wie viele Namen je Befund gedruckt werden.
  [int]$MaxList = 25
)

$ErrorActionPreference = 'Stop'

# Namen, die wie Skills aussehen, aber keine sind.
$Allow = @(
  'prefers-reduced-motion'
  'design-md'
  'datei-zeile'
  'gitingest'
  'ocr'
)

function Add-ToInventory {
  param(
    [System.Collections.Specialized.OrderedDictionary]$Map,
    [string]$Name,
    [string]$Path
  )
  if ($Map.Contains($Name)) {
    $Map[$Name] = @($Map[$Name]) + $Path
  } else {
    $Map[$Name] = @($Path)
  }
}

function Get-SkillInventory {
  param(
    [string[]]$FlatRoots,
    [string[]]$TreeRoots,
    [int]$Depth = 4
  )

  $map = [ordered]@{}

  foreach ($root in $FlatRoots) {
    if ([string]::IsNullOrWhiteSpace($root) -or -not (Test-Path -LiteralPath $root)) { continue }
    Get-ChildItem -LiteralPath $root -Directory -ErrorAction SilentlyContinue | ForEach-Object {
      if (Test-Path -LiteralPath (Join-Path $_.FullName 'SKILL.md')) {
        Add-ToInventory -Map $map -Name $_.Name -Path $root
      }
    }
  }

  foreach ($tree in $TreeRoots) {
    if ([string]::IsNullOrWhiteSpace($tree) -or -not (Test-Path -LiteralPath $tree)) { continue }
    Get-ChildItem -LiteralPath $tree -Recurse -Depth $Depth -ErrorAction SilentlyContinue |
      Where-Object { -not $_.PSIsContainer -and $_.Name -eq 'SKILL.md' } |
      ForEach-Object {
        $parent = [System.IO.Path]::GetDirectoryName($_.FullName)
        if ($parent) {
          Add-ToInventory -Map $map -Name ([System.IO.Path]::GetFileName($parent)) -Path $parent
        }
      }
  }

  return $map
}

function Write-Limited {
  param([string[]]$Items, [int]$Limit)
  $sorted = @($Items | Sort-Object)
  $sorted | Select-Object -First $Limit | ForEach-Object { Write-Host "  - $_" }
  if ($sorted.Count -gt $Limit) {
    Write-Host ("  … und {0} weitere" -f ($sorted.Count - $Limit))
  }
}

# --- Wurzeln ---------------------------------------------------------------

$repoRoot = (Resolve-Path -LiteralPath (Join-Path $SkillsRoot '..\..')).Path

$userHome = if ($env:USERPROFILE) { $env:USERPROFILE } elseif ($env:HOME) { $env:HOME } else { $null }
$agentsHome = if ($env:DSH_AGENTS_HOME) { $env:DSH_AGENTS_HOME } elseif ($userHome) { Join-Path $userHome '.agents' } else { $null }

$exportedHome = if ($env:PMH_HOME) { $env:PMH_HOME } elseif ($env:DSH_HOME) { $env:DSH_HOME } else { $null }
$homeDir = if ($exportedHome) { $exportedHome } else { Join-Path $repoRoot '.pmh-build\harness-home' }

$flatRoots = @($SkillsRoot, (Join-Path $homeDir 'skills'))
if ($agentsHome) { $flatRoots += (Join-Path $agentsHome 'skills') }
if ($userHome) { $flatRoots += (Join-Path $userHome '.dsh\skills') }
$flatRoots += $ExtraRoots

$treeRoots = @(
  (Join-Path $homeDir 'marketplaces')
  (Join-Path $homeDir 'plugins')
  (Join-Path $repoRoot 'units\skills')
  (Join-Path $repoRoot 'node_modules\@deepseek-ai\dsh-agent-preset\skills')
) + $ExtraTrees

$flatRoots = @($flatRoots | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -Unique)
$treeRoots = @($treeRoots | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -Unique)

$inventory = Get-SkillInventory -FlatRoots $flatRoots -TreeRoots $treeRoots

# Doppelung ist nur zwischen Wurzeln ein Konflikt, die der Loader gleichrangig liest.
# Vendor-Quellen (units/, marketplaces/, plugins/) sind Herkunft, nicht Konkurrenz.
$activeInventory = Get-SkillInventory -FlatRoots $flatRoots -TreeRoots @()

# --- Text des Index --------------------------------------------------------

$textFiles = @()
$index = Join-Path $SkillsRoot 'INDEX.md'
if (Test-Path -LiteralPath $index) { $textFiles += $index }

$catalogDir = Join-Path $SkillsRoot 'catalog'
if (Test-Path -LiteralPath $catalogDir) {
  $textFiles += Get-ChildItem -LiteralPath $catalogDir -Filter '*.md' | Select-Object -ExpandProperty FullName
}

if ($textFiles.Count -eq 0) {
  Write-Host 'FEHLER: weder INDEX.md noch catalog/*.md gefunden.' -ForegroundColor Red
  exit 1
}

$text = ($textFiles | ForEach-Object { Get-Content -LiteralPath $_ -Raw }) -join "`n"

# Nur Backtick-Namen, die wie Skill-Namen aussehen (klein, Ziffern, Bindestrich).
$tokens = @(
  [regex]::Matches($text, '`([a-z0-9][a-z0-9-]{1,})`') |
    ForEach-Object { $_.Groups[1].Value } |
    Sort-Object -Unique
)

# --- Prüfung 1: Abdeckung -------------------------------------------------

$project = @(
  Get-ChildItem -LiteralPath $SkillsRoot -Directory |
    Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'SKILL.md') } |
    Select-Object -ExpandProperty Name
)

$missing = @($project | Where-Object { $tokens -notcontains $_ })

# --- Prüfung 2: Genauigkeit ----------------------------------------------

$unknown = @(
  $tokens | Where-Object {
    $_ -match '-' -and -not $inventory.Contains($_) -and $Allow -notcontains $_
  }
)

# --- Prüfung 3: Doppelung -------------------------------------------------

$duplicates = @(
  $activeInventory.Keys | Where-Object { @($activeInventory[$_]).Count -gt 1 }
)

# --- Bericht --------------------------------------------------------------

Write-Host ''
Write-Host 'Skill-Index-Prüfung' -ForegroundColor Cyan
Write-Host ("  flache Wurzeln:     {0}" -f $flatRoots.Count)
Write-Host ("  Baumwurzeln:        {0}" -f $treeRoots.Count)
Write-Host ("  Skills insgesamt:   {0}" -f $inventory.Count)
Write-Host ("  Projekt-Skills:     {0}" -f $project.Count)
Write-Host ("  Namen im Index:     {0}" -f $tokens.Count)
Write-Host ''

$exit = 0

if ($missing.Count -gt 0) {
  Write-Host ("ABDECKUNG: {0} Projekt-Skill(s) fehlen im Index" -f $missing.Count) -ForegroundColor Yellow
  Write-Limited -Items $missing -Limit $MaxList
  $exit = 1
} else {
  Write-Host 'ABDECKUNG: vollständig' -ForegroundColor Green
}

Write-Host ''

if ($unknown.Count -gt 0) {
  Write-Host ("GENAUIGKEIT: {0} Name(n) existieren nirgends" -f $unknown.Count) -ForegroundColor Yellow
  Write-Limited -Items $unknown -Limit $MaxList
  $exit = 1
} else {
  Write-Host 'GENAUIGKEIT: alle Namen existieren' -ForegroundColor Green
}

Write-Host ''

if ($duplicates.Count -gt 0) {
  Write-Host ("DOPPELUNG: {0} Name(n) in mehreren Wurzeln" -f $duplicates.Count) -ForegroundColor Yellow
  $duplicates | Sort-Object | Select-Object -First $MaxList | ForEach-Object {
    Write-Host "  - $_"
    foreach ($path in $activeInventory[$_]) { Write-Host "      $path" }
  }
  Write-Host '  (Hinweis, kein Fehler: der Rang entscheidet, welche Fassung gilt.)'
} else {
  Write-Host 'DOPPELUNG: keine' -ForegroundColor Green
}

Write-Host ''
exit $exit
