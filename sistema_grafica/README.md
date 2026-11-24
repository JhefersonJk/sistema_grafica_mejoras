# Sistema Gráfica Ali

Gestión de pedidos de imprenta con tablero Kanban, notas, historial y reporte mensual. Requiere Python 3.10 o superior; entorno validado en Linux con Python 3.12.

## Windows

Ejecutar `iniciar_sistema.bat`. Crea un entorno virtual local e instala las dependencias si faltan. Para actualizar una instalación existente tras descargar cambios:

```bat
venv\Scripts\python -m pip install -r requirements.txt
```

`iniciar_oculto.vbs` inicia el sistema sin consola usando `server_runner.py`; los errores quedan en `server.log`. `detener_sistema.vbs` lo detiene. El navegador del lanzador normal se abre tras una espera fija: si el servidor tarda, recargar la página al terminar el arranque.

## Linux y macOS

Desde esta carpeta:

```bash
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.txt
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

El tablero responde en el puerto 8000. Para permitir acceso desde la red local de confianza, se puede usar `--host 0.0.0.0`. La aplicación no tiene autenticación: no publicarla directamente en Internet.

## Datos y zona horaria

Por defecto, SQLite usa `database.db` del directorio de trabajo. La base incluida se conserva. Para desarrollo con una base independiente, definir `DATABASE_URL` antes de arrancar:

```bash
export DATABASE_URL=sqlite:////ruta/absoluta/desarrollo.db
export APP_TIMEZONE=America/La_Paz
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

`APP_TIMEZONE` es opcional y por defecto usa `America/La_Paz`. `tzdata` permite resolverla también en Windows. Las fechas de entrega sin zona se interpretan en la hora del taller; las que incluyen zona se convierten a la del taller. La interfaz usa la hora del dispositivo: para operar el taller, configurar el dispositivo con su zona local.

Al iniciar se crea el esquema que falte y se añade `orders.delivered_at` a bases antiguas sin borrar sus registros. Hacer una copia de seguridad de la base antes de actualizar una instalación real. Esta migración es aditiva; las entregas nuevas registran su fecha real. Repetir la misma entrega no cambia la fecha y reabrir un pedido la elimina.

Las entregas antiguas sin fecha permanecen en el historial y no se asignan a las ventas de hoy. El informe mensual limita los resultados al mes actual e incluye cierres antiguos disponibles; si hay entregas fechadas para el mismo día, prevalecen estas. Los cierres antiguos pueden contener errores de la versión anterior y sus fechas de entrega no se pueden reconstruir con certeza.

Los importes muestran el precio total de los pedidos entregados, no movimientos de caja ni el momento de recepción de los adelantos. El saldo pendiente se calcula como precio menos adelanto. No se permite un adelanto superior al total, precios negativos, campos vacíos ni prioridades o fechas inválidas.

Los informes se calculan al consultarlos: no necesitan que el servidor siga encendido a medianoche. Las tablas históricas existentes se conservan.

## Desarrollo y pruebas

Ver [README de la raíz](../README.md). No hay paso de build para la interfaz. Los SVG, estilos y gráfica mensual se sirven localmente; no se necesita Chart.js ni un CDN. El enlace opcional de WhatsApp reconoce números bolivianos de celular presentes en nombres de clientes antiguos y no envía mensajes automáticamente.
