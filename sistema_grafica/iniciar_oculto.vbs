' Sistema Grafica Ali - Inicio discreto (sin ventana de consola)
'
' IMPORTANTE: antes de usar este acceso directo por primera vez, hay que
' abrir una vez "iniciar_sistema.bat" (esa si muestra una ventana) para que
' instale Python y las dependencias necesarias. Despues de eso, este
' archivo ya se puede usar normalmente para el dia a dia.

Dim objShell, objFSO, scriptDir, pythonwPath, Q

Set objShell = CreateObject("WScript.Shell")
Set objFSO = CreateObject("Scripting.FileSystemObject")
Q = Chr(34) ' comilla doble

scriptDir = objFSO.GetParentFolderName(WScript.ScriptFullName)
objShell.CurrentDirectory = scriptDir

pythonwPath = scriptDir & "\venv\Scripts\pythonw.exe"

If Not objFSO.FileExists(pythonwPath) Then
    MsgBox "Todavia no esta instalado el sistema en este equipo." & vbCrLf & vbCrLf & _
           "Antes de usar este acceso directo, abre una vez 'iniciar_sistema.bat' " & _
           "para que instale todo lo necesario (esa ventana si se ve, solo la " & _
           "primera vez). Despues de eso, ya podes usar este acceso directo " & _
           "normalmente, sin que se vea ninguna ventana.", _
           vbExclamation, "Sistema Grafica Ali"
    WScript.Quit
End If

' Arranca el servidor en segundo plano, sin ninguna ventana (0 = oculto)
objShell.Run Q & pythonwPath & Q & " server_runner.py", 0, False

' Espera a que el servidor este listo y abre el navegador
WScript.Sleep 3000
objShell.Run "cmd /c start " & Q & Q & " " & Q & "http://localhost:8000" & Q, 0, True
