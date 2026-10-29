# Generates the app icons in public/ from the company logo (assets/logo.png).
# Uses Windows' built-in System.Drawing, no extra installs.
# Run from the project folder:  powershell -ExecutionPolicy Bypass -File scripts\make-icons.ps1
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$logo = [System.Drawing.Image]::FromFile((Join-Path $root 'assets\logo.png'))

# name, size in pixels, share of the icon the logo fills. Install icons keep the
# logo inside the central ~80 % so Android can crop them to a circle safely.
$icons = @(
  @('pwa-192.png', 192, 0.82),
  @('pwa-512.png', 512, 0.82),
  @('apple-touch-icon.png', 180, 0.86),
  @('favicon.png', 64, 0.98)
)

foreach ($i in $icons) {
  $name = $i[0]; $size = [int]$i[1]; $fill = [double]$i[2]
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.Clear([System.Drawing.Color]::White)
  $d = [int][Math]::Round($size * $fill)
  $off = [int][Math]::Round(($size - $d) / 2)
  $g.DrawImage($logo, $off, $off, $d, $d)
  $g.Dispose()
  $out = Join-Path $root "public\$name"
  $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  "public\$name"
}
$logo.Dispose()
