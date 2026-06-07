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
  (Join-Path $root 'Utils\WeChatMiniGameAds.ts'),
  (Join-Path $root 'Utils\WeChatRewardedVideoAd.ts'),
  (Join-Path $root 'Manager\DataManager.ts'),
  (Join-Path $root 'Manager\MusicManager.ts'),
  (Join-Path $root 'Manager\GameManager.ts'),
  (Join-Path $root 'Manager\MenuManager.ts'),
  (Join-Path $root 'Manager\GameUIManager.ts'),
  (Join-Path $root 'Manager\ToastManager.ts'),
  (Join-Path $root 'MenuOverlayWindow.ts'),
  (Join-Path $op 'Core\OpticalPuzzleTypes.ts'),
  (Join-Path $op 'Core\OpticalLightColor.ts'),
  (Join-Path $op 'Core\OpticalBeamTracer.ts'),
  (Join-Path $op 'Core\OpticalPieceConnectivity.ts'),
  (Join-Path $op 'Core\OpticalColorMix.ts'),
  (Join-Path $op 'Core\OpticalMirrorReflection.ts'),
  (Join-Path $op 'Core\OpticalPuzzleCore.ts'),
  (Join-Path $op 'Application\OpticalPuzzleSession.ts'),
  (Join-Path $op 'Application\OpticalPuzzleStateMachine.ts'),
  (Join-Path $op 'Config\OpticalPuzzleLevelSchema.ts'),
  (Join-Path $op 'Config\OpticalPuzzleLevels.ts'),
  (Join-Path $op 'Presentation\OpticalPuzzleRoot.ts'),
  (Join-Path $op 'Presentation\OpticalPuzzleBoardView.ts'),
  (Join-Path $op 'Presentation\OpticalPuzzleBeamView.ts'),
  (Join-Path $op 'Presentation\OpticalPuzzleBeamImpactView.ts'),
  (Join-Path $op 'Core\OpticalBeamTypes.ts'),
  (Join-Path $op 'Presentation\OpticalPuzzlePieceGlyph.ts'),
  (Join-Path $op 'Presentation\OpticalPuzzleColorUtil.ts'),
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
function Ensure-Meta($path, $template) {
  if (Test-Path $path) {
    return
  }
  $u = [guid]::NewGuid().ToString()
  $content = $template.Replace('__UUID__', $u)
  $utf8NoBom = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllText($path, $content, $utf8NoBom)
  Write-Host "created $path"
}
foreach ($d in $dirs) {
  Ensure-Meta (Join-Path $d '.meta') $dirMeta
}
foreach ($f in $tsFiles) {
  Ensure-Meta ($f + '.meta') $tsMeta
}
Write-Host 'meta ok (existing .meta preserved)'
