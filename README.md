# Gráfica Ali

Tablero de producción para una imprenta: pedidos, notas, entregas e informes en bolivianos. Backend FastAPI + SQLite; interfaz HTML, CSS y JavaScript sin compilación ni dependencias externas de navegador.

El código y las instrucciones de arranque están en [sistema_grafica/README.md](sistema_grafica/README.md).

## Pruebas

Desde la raíz, con un entorno virtual activo:

```bash
python -m pip install -r sistema_grafica/requirements-dev.txt
python -m unittest discover -s tests -v
python tests/browser_smoke.py
```

La prueba de navegador requiere Chromium: usa el ejecutable del sistema si está instalado o `python -m playwright install chromium`. Se puede indicar su ruta con `CHROMIUM_PATH`. `APP_PYTHON` permite elegir el intérprete del servidor si es distinto del intérprete de la prueba. Las capturas se guardan en `artifacts/` (o `UI_ARTIFACTS`). Ambas suites usan bases temporales y no modifican los datos del taller.

## Diseño

La interfaz usa una paleta CMYK adaptada a pantallas, con negro de tinta, papel claro y acentos cian, magenta y amarillo. Incluye búsqueda por cliente/trabajo, prioridad, contadores, formularios accesibles, confirmación de entrega y estados de conexión. Ver [las decisiones de diseño](docs/design.md), basadas en [UI/UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill).
