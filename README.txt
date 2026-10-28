ASISTENCIA QR ANDROID — FASE 1 (PROTOTIPO LOCAL)

ALCANCE IMPLEMENTADO
- Alta local de empleados y tokens aleatorios únicos.
- Cámara QR usando BarcodeDetector si el navegador Android lo soporta.
- Captura manual del token para probar sin cámara.
- Registros con hora, empleado, tablet y área de tablet en IndexedDB.
- Prevención básica de lecturas repetidas (<60 s).
- Exportación CSV para respaldo.
- Shell PWA almacenado para arranque offline después de la primera carga.

NO IMPLEMENTADO TODAVÍA
- Subida automática a Google Sheets / Apps Script.
- Seguridad de administración, autorización de tablets y autenticación.
- Reglas completas para jornadas, múltiples áreas y cambios de área.
- Bloqueo por identidad real (una foto de QR puede copiarse).
- Protección contra modificación del reloj del equipo.
- Generación gráfica del QR en la interfaz.

INSTALACIÓN
1. Descomprime los archivos sin cambiar su estructura.
2. Sube la carpeta a un hosting HTTPS de archivos estáticos, por ejemplo GitHub Pages.
   No abras index.html con file://: el Service Worker necesita HTTPS/localhost.
3. En Chrome Android abre la URL pública HTTPS, concede permiso a cámara y usa
   el menú > Añadir a pantalla principal / Instalar.
4. En Equipo define TAB-001 y el área física.
5. En Empleados agrega un empleado, copia el token, y para probar pega el token en Lector.
6. Para prueba física crea un QR de texto que contenga exactamente ese token.
   No subas credenciales reales a generadores de QR de terceros sin revisarlo.
7. Abre la PWA una primera vez con internet, verifica que funcione y prueba modo avión.
8. Exporta el CSV antes de borrar almacenamiento o desinstalar la app.

NOTAS
- BarcodeDetector depende de soporte de navegador. Si no está disponible, se
  incorporará un decodificador QR empaquetado localmente en la siguiente etapa.
- Instalar una PWA no garantiza preservación absoluta de datos; usar backups.
- La alternancia Entrada/Salida es provisional y NO sirve para producción ni
  movimientos entre áreas sin definir reglas laborales.
- La fase 2 agregará sincronización confirmada y deduplicada hacia Sheets.