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
