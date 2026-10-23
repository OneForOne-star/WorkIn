# WorkIn - configura el correo (Brevo) en el servidor. La clave no se guarda en ningun archivo.
$ErrorActionPreference = 'Stop'
$key = Join-Path $env:USERPROFILE '.ssh\workin_deploy'
$srv = if ($env:WORKIN_SERVIDOR) { $env:WORKIN_SERVIDOR } else { 'usuario@servidor' }
$remote = Join-Path $PSScriptRoot 'correo_remote.sh'
if (-not (Test-Path $remote)) { throw 'Falta correo_remote.sh junto a este script.' }

Write-Host 'Datos de Brevo (SMTP y API > SMTP). La clave no se mostrara al escribirla.' -ForegroundColor Cyan
$u = Read-Host 'Usuario SMTP (login)'
$sec = Read-Host 'Clave SMTP' -AsSecureString
$test = Read-Host 'Correo donde recibir la prueba'
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
$p = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)

& scp -i $key $remote "${srv}:~/correo_remote.sh"
if ($LASTEXITCODE -ne 0) { throw 'Fallo la subida.' }
"$u`n$p`n$test`n" | & ssh -i $key $srv 'bash ~/correo_remote.sh; rm -f ~/correo_remote.sh'
$p = $null
if ($LASTEXITCODE -ne 0) { Write-Host 'Hubo un error. Copia el texto de arriba (sin la clave) y pegamelo.' -ForegroundColor Red; exit 1 }
Write-Host 'Revisa tu bandeja (y spam).' -ForegroundColor Green
