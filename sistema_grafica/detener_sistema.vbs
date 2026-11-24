' Sistema Grafica Ali - Detener el servidor
' Doble clic en este archivo apaga el servidor, este corriendo visible u oculto.

Dim objShell, objFSO, scriptDir, Q

Set objShell = CreateObject("WScript.Shell")
Set objFSO = CreateObject("Scripting.FileSystemObject")
Q = Chr(34)

scriptDir = objFSO.GetParentFolderName(WScript.ScriptFullName)

objShell.Run "powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File " & _
             Q & scriptDir & "\detener_sistema.ps1" & Q, 0, True

MsgBox "Sistema Grafica Ali: el servidor fue detenido (si estaba encendido).", _
       vbInformation, "Sistema Grafica Ali"
