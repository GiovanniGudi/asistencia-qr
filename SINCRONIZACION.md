# Conexión con Google Sheets Reporteo

**Estado:** Código incluido, pero no operativo hasta publicar Apps Script y colocar su URL en app.js.

1. Abrir la hoja "Reporteo" en Google Sheets.
2. Ir a **Extensiones → Apps Script**.
3. Pegar el contenido de `apps-script/Code.gs` y guardar.
4. Desplegar → Nueva implementación → Aplicación web → Ejecutar como: propietario.
5. Acceso: se necesita aceptar solicitudes anónimas de tablets, por lo que **es obligatorio incorporar autenticación antes de uso real**. El ejemplo no autentica las tablets y NO debe publicarse con empleados reales.
6. Copiar URL terminada en `/exec`.
7. Editar en app.js `SYNC_URL`, colocando esa URL.
8. Recargar la PWA con internet. Primero realizar pruebas con empleados ficticios.
9. Cambiar la hoja a acceso restringido. No compartir con edición pública.

El cliente guarda primero en IndexedDB. En internet envía lotes POST y consulta confirmaciones por IDs mediante JSONP GET; solo marca sincronizado después de observar los IDs en la hoja. Si la app está cerrada no se garantiza sincronización hasta volver a abrirla. Si se borran datos de Chrome, se desinstala, el equipo se pierde o Android elimina almacenamiento, pueden perderse registros locales: realice respaldos y pruebas.

La pantalla muestra movimientos del día del almacenamiento local. No implica visualización consolidada de todos los dispositivos desconectados.
