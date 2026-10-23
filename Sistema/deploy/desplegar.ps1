# WorkIn - despliegue con un comando. Uso:  .\desplegar
$ErrorActionPreference = 'Stop'
$key = Join-Path $env:USERPROFILE '.ssh\workin_deploy'
$srv = if ($env:WORKIN_SERVIDOR) { $env:WORKIN_SERVIDOR } else { 'usuario@servidor' }
$base = $PSScriptRoot
$dir = Join-Path $base 'entrega'

if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
$files = @()
if (Test-Path $dir) { $files = @(Get-ChildItem $dir -File) }
if ($files.Count -eq 0) { Write-Host 'No hay nada en la carpeta "entrega". Nada que desplegar.'; exit 0 }

Write-Host ''
Write-Host 'Se van a enviar y aplicar en el servidor:' -ForegroundColor Cyan
foreach ($f in $files) {
  $q = switch -Wildcard ($f.Name) {
    '*.sql'       { 'SQL: modifica la base de datos (con respaldo previo)' }
    'backend.zip' { 'Backend: reemplaza archivos de la API (con respaldo previo)' }
    'web.zip'     { 'Frontend: reemplaza la web (con respaldo previo)' }
    'post.sh'     { 'Comandos extra en el servidor (se muestran abajo)' }
    default       { 'Archivo no reconocido: se subira pero no se usara' }
  }
  Write-Host ("  - {0}  ->  {1}" -f $f.Name, $q)
}
$post = Join-Path $dir 'post.sh'
if (Test-Path $post) {
  Write-Host ''; Write-Host 'Contenido de post.sh:' -ForegroundColor Yellow
  Get-Content $post | ForEach-Object { Write-Host "    $_" }
}
Write-Host ''
$r = Read-Host 'Continuar? (s/n)'
if ($r -ne 's' -and $r -ne 'S') { Write-Host 'Cancelado. No se toco nada.'; exit 0 }

$remoteScript = Join-Path $base 'deploy_remote.sh'
if (-not (Test-Path $remoteScript)) { throw 'Falta deploy_remote.sh junto a este script.' }

& ssh -i $key $srv 'rm -rf ~/entrega && mkdir -p ~/entrega'
if ($LASTEXITCODE -ne 0) { throw 'No pude conectar al servidor.' }
$paths = @($files | ForEach-Object { $_.FullName }) + $remoteScript
& scp -i $key @paths "${srv}:~/entrega/"
if ($LASTEXITCODE -ne 0) { throw 'Fallo la subida de archivos.' }

& ssh -i $key $srv 'bash ~/entrega/deploy_remote.sh'
if ($LASTEXITCODE -ne 0) {
  Write-Host ''; Write-Host 'El despliegue se detuvo con un error. Copia el texto de arriba y pegamelo.' -ForegroundColor Red
  exit 1
}

$hecho = Join-Path $base ('entregado\' + (Get-Date -Format 'yyyy-MM-dd_HHmm'))
New-Item -ItemType Directory -Force -Path $hecho | Out-Null
Move-Item -Path (Join-Path $dir '*') -Destination $hecho
Write-Host ''; Write-Host 'Despliegue terminado. Los archivos quedaron guardados en entregado\.' -ForegroundColor Green
