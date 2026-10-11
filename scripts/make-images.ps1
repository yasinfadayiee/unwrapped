# Generates the PNG icons and the social share image (Windows PowerShell).
#   powershell -ExecutionPolicy Bypass -File scripts/make-images.ps1
Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Stop'
$out = Join-Path $PSScriptRoot '..\public\assets\img'
New-Item -ItemType Directory -Force $out | Out-Null

function New-Color([string]$hex, [int]$alpha = 255) {
  $c = [System.Drawing.ColorTranslator]::FromHtml($hex)
  return [System.Drawing.Color]::FromArgb($alpha, $c.R, $c.G, $c.B)
}

function Add-Glow($g, [float]$cx, [float]$cy, [float]$r, [string]$hex, [int]$alpha) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddEllipse($cx - $r, $cy - $r, $r * 2, $r * 2)
  $brush = New-Object System.Drawing.Drawing2D.PathGradientBrush($path)
  $brush.CenterColor = New-Color $hex $alpha
  $brush.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 0, 0, 0))
  $g.FillPath($brush, $path)
  $brush.Dispose(); $path.Dispose()
}

# The logo mark, drawn in a 32x32 design space scaled by $s at offset ($ox, $oy).
function Draw-Logo($g, [float]$ox, [float]$oy, [float]$s) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $p.StartFigure()
  $p.AddLine($ox + 8 * $s, $oy + 3 * $s, $ox + 20 * $s, $oy + 3 * $s)
  $p.AddLine($ox + 20 * $s, $oy + 3 * $s, $ox + 29 * $s, $oy + 12 * $s)
  $p.AddLine($ox + 29 * $s, $oy + 12 * $s, $ox + 29 * $s, $oy + 24 * $s)
  $p.AddArc($ox + 19 * $s, $oy + 19 * $s, 10 * $s, 10 * $s, 0, 90)
  $p.AddLine($ox + 24 * $s, $oy + 29 * $s, $ox + 8 * $s, $oy + 29 * $s)
  $p.AddArc($ox + 3 * $s, $oy + 19 * $s, 10 * $s, 10 * $s, 90, 90)
  $p.AddLine($ox + 3 * $s, $oy + 24 * $s, $ox + 3 * $s, $oy + 8 * $s)
  $p.AddArc($ox + 3 * $s, $oy + 3 * $s, 10 * $s, 10 * $s, 180, 90)
  $p.CloseFigure()
  $pen = New-Object System.Drawing.Pen((New-Color '#f4f4f6'), [float](2.4 * $s))
  $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $g.DrawPath($pen, $p)

  $flap = New-Object System.Drawing.Drawing2D.GraphicsPath
  $flap.AddPolygon([System.Drawing.PointF[]]@(
    (New-Object System.Drawing.PointF(($ox + 20 * $s), ($oy + 3 * $s))),
    (New-Object System.Drawing.PointF(($ox + 20 * $s), ($oy + 9.2 * $s))),
    (New-Object System.Drawing.PointF(($ox + 20.9 * $s), ($oy + 11.1 * $s))),
    (New-Object System.Drawing.PointF(($ox + 22.8 * $s), ($oy + 12 * $s))),
    (New-Object System.Drawing.PointF(($ox + 29 * $s), ($oy + 12 * $s)))
  ))
  $lime = New-Object System.Drawing.SolidBrush((New-Color '#d7ff3a'))
  $g.FillPath($lime, $flap)
  $limePen = New-Object System.Drawing.Pen((New-Color '#d7ff3a'), [float](2.4 * $s))
  $limePen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $g.DrawPath($limePen, $flap)
  $violet = New-Object System.Drawing.SolidBrush((New-Color '#8f7dff'))
  $g.FillEllipse($violet, $ox + 9.6 * $s, $oy + 15.6 * $s, 6.8 * $s, 6.8 * $s)
  $pen.Dispose(); $limePen.Dispose(); $lime.Dispose(); $violet.Dispose(); $p.Dispose(); $flap.Dispose()
}

function New-Canvas([int]$w, [int]$h) {
  $bmp = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  return @($bmp, $g)
}

function Save-Icon([int]$size, [string]$name) {
  $bmp, $g = New-Canvas $size $size
  $g.Clear((New-Color '#07070b'))
  Add-Glow $g ($size * 0.3) ($size * 0.25) ($size * 0.7) '#8f7dff' 90
  $s = $size / 32 * 0.62
  $offset = ($size - 32 * $s) / 2
  Draw-Logo $g $offset $offset $s
  $bmp.Save((Join-Path $out $name), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}

Save-Icon 192 'icon-192.png'
Save-Icon 512 'icon-512.png'
Save-Icon 180 'apple-touch-icon.png'

# Social share image 1200x630
$bmp, $g = New-Canvas 1200 630
$g.Clear((New-Color '#07070b'))
Add-Glow $g 220 120 520 '#8f7dff' 120
Add-Glow $g 1080 620 460 '#d7ff3a' 55
Add-Glow $g 980 120 300 '#e0574a' 40
$gridPen = New-Object System.Drawing.Pen((New-Color '#ffffff' 12), 1)
for ($x = 0; $x -lt 1200; $x += 60) { $g.DrawLine($gridPen, $x, 0, $x, 630) }
for ($y = 0; $y -lt 630; $y += 60) { $g.DrawLine($gridPen, 0, $y, 1200, $y) }

Draw-Logo $g 72 60 1.7
$brandFont = New-Object System.Drawing.Font('Segoe UI', 30, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$white = New-Object System.Drawing.SolidBrush((New-Color '#f4f4f6'))
$g.DrawString('Unwrapped', $brandFont, $white, 140, 70)

$h1 = New-Object System.Drawing.Font('Segoe UI', 96, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$g.DrawString('Your socials,', $h1, $white, 62, 170)
$serif = New-Object System.Drawing.Font('Georgia', 104, [System.Drawing.FontStyle]::Italic, [System.Drawing.GraphicsUnit]::Pixel)
$lime = New-Object System.Drawing.SolidBrush((New-Color '#d7ff3a'))
$g.DrawString('unwrapped.', $serif, $lime, 66, 282)

$sub = New-Object System.Drawing.Font('Segoe UI', 30, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
$gray = New-Object System.Drawing.SolidBrush((New-Color '#b9b9c6'))
$dot = [char]0x00B7
$g.DrawString("Who doesn't follow you back  $dot  who unfollowed you`nyour real TikTok screen time  $dot  what advertisers know", $sub, $gray, 72, 432)

$chipFont = New-Object System.Drawing.Font('Segoe UI', 22, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$chipBrush = New-Object System.Drawing.SolidBrush((New-Color '#d7ff3a' 30))
$chipPen = New-Object System.Drawing.Pen((New-Color '#d7ff3a' 110), 1.5)
$g.FillRectangle($chipBrush, 72, 540, 398, 46)
$g.DrawRectangle($chipPen, 72, 540, 398, 46)
$g.DrawString("No password  $dot  Nothing uploaded", $chipFont, $lime, 92, 548)

$bmp.Save((Join-Path $out 'og.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Write-Output "Images written to $out"
