# WorkIn - verifica la instalacion (solo lectura). Uso:  .\verificar.cmd
$ErrorActionPreference = 'Stop'
$key = Join-Path $env:USERPROFILE '.ssh\workin_deploy'
$srv = if ($env:WORKIN_SERVIDOR) { $env:WORKIN_SERVIDOR } else { 'usuario@servidor' }
& scp -i $key (Join-Path $PSScriptRoot 'verificar2.php') "${srv}:~/entrega_verificar2.php"
& scp -i $key (Join-Path $PSScriptRoot 'verificar2_remote.sh') "${srv}:~/verificar2_remote.sh"
& ssh -i $key $srv 'bash ~/verificar2_remote.sh; rm -f ~/verificar2_remote.sh'
