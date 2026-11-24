# Dirección visual de Gráfica Ali

## Referencia y criterio

Se aplicó [UI/UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill), consultando su SKILL.md, búsquedas de sistema visual y foco de teclado, y listas de accesibilidad y entrega. La búsqueda inicial mezcló una página comercial con recomendaciones de dashboard; una consulta más concreta confirmó el estilo de dashboard de datos. Se adoptan jerarquía, retícula, contraste, estados y foco. El patrón de landing y las paletas automáticas no corresponden al taller: la paleta CMYK procede del encargo del usuario.

## Tokens y composición

- Cian `#00b9d6`: pendientes y primer acento de identidad.
- Magenta `#dc2378`: producción y prioridad urgente con etiqueta textual.
- Amarillo `#f7d633`: entrega y detalles del taller; siempre texto oscuro encima.
- Negro `#18191b`: navegación, texto y acción principal.
- Papel `#f7f7f3`: fondo; tarjetas blancas y bordes discretos.

Son representaciones RGB inspiradas en tintas CMYK. Los tokens viven en `static/style.css`. Tipografía del sistema para no depender de fuentes externas. Iconos SVG de trazo uniforme, sin emojis ni paquetes remotos.

El resumen antecede al tablero. Las tarjetas muestran cliente, trabajo, entrega, precio, saldo y siguiente acción. Los números se alinean con cifras tabulares. La prioridad combina color y texto. El tablero se apila en móviles y conserva las acciones completas.

## Interacciones

- Un CTA principal: nuevo pedido. Búsqueda local y filtro de prioridad conservan el resumen global.
- Diálogos nativos: foco contenido, Escape y retorno al activador.
- Etiquetas visibles, errores de formulario y bloqueo de envíos repetidos.
- Confirmación antes de entregar y considerar cobrado el total.
- Borradores conservados ante errores de red; estado de conexión y reintento.
- Consultas periódicas sin solapamiento; pausa con la pestaña oculta. Se evita reconstruir el DOM si los datos no cambian.
- Estados vacíos, fechas próximas/vencidas calculadas desde la fecha original y sin toasts repetitivos.
- Contraste de texto, foco visible, controles de al menos 44 px y preferencia de movimiento reducido. Esta versión tiene un único tema claro con navegación oscura.

## Validación

Las pruebas de `tests/browser_smoke.py` ejercitan los flujos principales en Chromium con base temporal. Comprueban 375, 768, 1024 y 1440 px, orientación horizontal, movimiento reducido, teclado, errores de red, escape de HTML y ausencia de desbordamiento horizontal. Las capturas usan datos de ejemplo que no se incorporan a la base del taller.

## Actualización del tablero

La búsqueda admite coincidencias sin tildes, muestra cuántos pedidos coinciden y permite limpiar ambos filtros con un botón. En móvil, los enlaces de etapa llevan el foco al encabezado de su columna.

Se aplicó la [guía de rendimiento de GSAP](https://github.com/greensock/gsap-skills/tree/main/skills/gsap-performance) al gráfico mensual. Las barras aparecen mediante una transformación horizontal en CSS y respetan la preferencia de movimiento reducido. La interfaz sigue usando recursos locales.

Se reutilizan los formateadores y se prepara el índice de búsqueda y el orden de las tarjetas cuando cambian los pedidos. Cada columna conserva su DOM mientras el contenido visible sea idéntico. Las notas y el resumen financiero se actualizan de forma independiente.

Medición en Chromium con 600 pedidos simulados, 200 por etapa. Con `MutationObserver` sobre el tablero, una sincronización forzada con datos idénticos pasó de 603 nodos agregados y 603 eliminados a cero en ambos casos. La prueba de navegador protege la identidad del botón activo y su foco durante esa sincronización. La medición corresponde a cambios del DOM en el cliente.

## Próximas prioridades

1. Automatizar copias de SQLite y ensayar la restauración con una copia de desarrollo.
2. Medir el tiempo y el tamaño de las tres respuestas periódicas con datos representativos. Si el tráfico repetido resulta significativo, evaluar respuestas condicionales o una consulta de sincronización consolidada.
3. Medir la apertura del historial con varios años de entregas. Si crece el tiempo de carga, priorizar paginación y búsqueda con índices verificados.
