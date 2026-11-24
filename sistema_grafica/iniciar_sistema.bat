@echo off
setlocal enabledelayedexpansion
title Sistema Grafica Ali - Servidor
cd /d "%~dp0"

echo ===================================================
echo   SISTEMA GRAFICA ALI - INICIANDO SERVIDOR
echo ===================================================
echo.

rem 1. Buscar una instalacion REAL de Python (no el alias falso de la
rem    Microsoft Store que Windows deja activado por defecto).
set "PYTHON_EXE="

for /f "delims=" %%V in ('python --version 2^>^&1') do set "PY_CHECK=%%V"
echo !PY_CHECK! | findstr /b /c:"Python 3" >nul
if not errorlevel 1 set "PYTHON_EXE=python"

if not defined PYTHON_EXE (
    py -3 --version >nul 2>nul
    if not errorlevel 1 set "PYTHON_EXE=py -3"
)

if not defined PYTHON_EXE (
    echo [ERROR] No se encontro una instalacion real de Python en este equipo.
    echo.
    echo Esto suele pasar cuando Windows tiene activo el "alias" que abre la
    echo Microsoft Store en vez de ejecutar Python de verdad. Para arreglarlo:
    echo.
    echo   1. Descarga e instala Python desde: https://www.python.org/downloads/
    echo      IMPORTANTE: marca la casilla "Add Python to PATH" durante la
    echo      instalacion.
    echo   2. Si despues de instalarlo este mensaje sigue apareciendo, ve a:
    echo      Configuracion de Windows ^> Aplicaciones ^> Alias de ejecucion
    echo      de aplicaciones, y DESACTIVA "python.exe" y "python3.exe".
    echo   3. Vuelve a abrir este archivo.
    echo.
    pause
    exit /b 1
)

echo Usando: !PYTHON_EXE!

rem 2. Crear el entorno virtual dentro de esta misma carpeta si no existe
if not exist "venv\Scripts\python.exe" (
    echo Primera vez que se ejecuta: creando entorno virtual...
    !PYTHON_EXE! -m venv venv
    if errorlevel 1 (
        echo [ERROR] No se pudo crear el entorno virtual.
        pause
        exit /b 1
    )
)

rem 3. Activar el entorno virtual
call "venv\Scripts\activate.bat"

rem 4. Instalar dependencias solo si todavia no estan instaladas
python -c "import fastapi, uvicorn, sqlalchemy" >nul 2>nul
if errorlevel 1 (
    echo Instalando dependencias necesarias, esto puede tardar unos minutos...
    python -m pip install --disable-pip-version-check --quiet --upgrade pip
    pip install --disable-pip-version-check -r requirements.txt
    if errorlevel 1 (
        echo [ERROR] Fallo la instalacion de dependencias. Revisa tu conexion a internet.
        pause
        exit /b 1
    )
    echo Dependencias instaladas correctamente.
    echo.
)

rem 5. Abrir el navegador un par de segundos despues, cuando el servidor ya este listo
start "" cmd /c "timeout /t 3 >nul & start http://localhost:8000"

echo.
echo Servidor disponible en:
echo   - Este equipo (PC del taller):  http://localhost:8000
echo   - Otros equipos en la red Wifi: http://%COMPUTERNAME%:8000
echo     (si no conecta, usa la IP de esta PC, revisala con "ipconfig")
echo.
echo No cierres esta ventana mientras el sistema este en uso.
echo Para apagar el servidor: cierra esta ventana o presiona CTRL+C.
echo ===================================================
echo.

uvicorn main:app --host 0.0.0.0 --port 8000

echo.
echo El servidor se detuvo.
pause
