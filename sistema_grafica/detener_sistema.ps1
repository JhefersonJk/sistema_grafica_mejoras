# Busca el proceso que esta escuchando en el puerto 8000 (nuestro servidor)
# y lo detiene. No importa si se inicio con iniciar_sistema.bat o con
# iniciar_oculto.vbs, este script lo encuentra igual por el puerto.

$conexion = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue

if ($conexion) {
    $conexion | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object {
        Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
    }
    Write-Output "Sistema detenido."
} else {
    Write-Output "El sistema no estaba corriendo."
}
