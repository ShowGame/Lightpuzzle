$ErrorActionPreference = 'Stop'
$proj = Split-Path $PSScriptRoot -Parent
$root = Join-Path $proj 'assets\Scripts'
$games = Join-Path $root 'Games'
$op = Join-Path $games 'OpticalPuzzle'
$dirs = @(
  $root,
  (Join-Path $root 'Utils'),
  (Join-Path $root 'Manager'),
  $games,
  $op,
  (Join-Path $op 'Core'),
  (Join-Path $op 'Application'),
  (Join-Path $op 'Config'),
  (Join-Path $op 'Presentation')
)
$tsFiles = @(
  (Join-Path $root 'Utils\Enum.ts'),
  (Join-Path $root 'Utils\Event.ts'),
  (Join-Path $root 'Utils\Utils.ts'),
  (Join-Path $root 'Manager\DataManager.ts'),
  (Join-Path $root 'Manager\MusicManager.ts'),
  (Join-Path $root 'Manager\GameManager.ts'),
  (Join-Path $root 'Manager\MenuManager.ts'),
  (Join-Path $root 'Manager\GameUIManager.ts'),
  (Join-Path $op 'Core\OpticalPuzzleTypes.ts'),
  (Join-Path $op 'Core\OpticalPuzzleCore.ts'),
  (Join-Path $op 'Application\OpticalPuzzleSession.ts'),
  (Join-Path $op 'Application\OpticalPuzzleStateMachine.ts'),
  (Join-Path $op 'Config\OpticalPuzzleLevelSchema.ts'),
  (Join-Path $op 'Presentation\OpticalPuzzleRoot.ts'),
  (Join-Path $op 'Presentation\OpticalPuzzleBoardView.ts'),
  (Join-Path $op 'Presentation\OpticalPuzzleInputHud.ts')
)
$dirMeta = @'
{
  "ver": "1.2.0",
  "importer": "directory",
  "imported": true,
  "uuid": "__UUID__",
  "files": [],
  "subMetas": {},
  "userData": {}
}
'@
$tsMeta = @'
{
  "ver": "4.0.24",
  "importer": "typescript",
  "imported": true,
  "uuid": "__UUID__",
  "files": [],
  "subMetas": {},
  "userData": {}
}
'@
foreach ($d in $dirs) {
  $u = [guid]::NewGuid().ToString()
  $p = Join-Path $d '.meta'
  $dirMeta.Replace('__UUID__', $u) | Set-Content -Path $p -Encoding UTF8
}
foreach ($f in $tsFiles) {
  $u = [guid]::NewGuid().ToString()
  $p = $f + '.meta'
  $tsMeta.Replace('__UUID__', $u) | Set-Content -Path $p -Encoding UTF8
}
Write-Host 'meta ok'
