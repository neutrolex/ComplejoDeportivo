# Organización del proyecto

El frontend agrupa pantallas y diálogos por dominio en `frontend/src/modules`: reservas, horarios-fijos, inventario, finanzas, comentarios, disponibilidad y auth. `components` conserva layout, calendario, confirmación y primitivas `ui` compartidas. `api`, contextos, utilidades y estilos siguen siendo comunes.

En reservas, `PanelDisponibilidad.jsx` coordina datos, selección y acciones. `horarios.js` construye bloques y grilla (medianoche al final del día equivale a 24); `pagos.js` suma por método y tipo; `CeldasReserva.jsx` muestra contenido, adelanto y estado de pago. El JSX, las clases y las reglas visuales se conservan. `App.jsx` usa un solo wrapper de autenticación/layout, con una clave por página para conservar el montaje independiente al navegar.

En PHP, los controladores reciben HTTP y emiten las respuestas. `DeudaService::marcarDeuda` reúne cambio de estado, aumento de deuda y nota informativa en la misma transacción. `ComentarioDiaService` conserva las transacciones de alta, edición y eliminación de comentarios/pagos de academia: al editar aplica la diferencia; al borrar repone el monto. `ReservaService` sigue gestionando reservas y pagos, con la distinción entre depósito original y saldo. Los modelos mantienen SQL y formato de salida.

Se preservan las reglas existentes: el estado de pago es manual, la deuda puede ser negativa, marcar deuda no genera ingreso, cancelar/ausente no revierte deuda automáticamente y registrar deuda de nuevo vuelve a sumarla. Esta extracción no introduce idempotencia ni nuevas reglas contables. Las notas de adelanto con `cuenta_en_total=false` no duplican el pago en los totales.

El orden de actualización de bases existentes está en [database/README.md](../database/README.md). No se modificaron los SQL.

## Verificación local

```sh
npm --prefix frontend ci --ignore-scripts
npm --prefix frontend test
npm --prefix frontend run build
npm --prefix frontend run lint
php backend/tests/regresion.php
```

Las pruebas PHP requieren PHP 8 con BCMath, mbstring y PDO SQLite. Ejecutan los servicios y modelos reales sobre tablas mínimas en memoria, sin cargar configuración ni conectarse a MySQL. Verifican depósito/saldo, deuda, edición/eliminación de pagos y rollback mediante errores SQL inducidos. No sustituyen una prueba de integración con MySQL: no cubren sus ENUM, DECIMAL, claves foráneas ni concurrencia. Las pruebas frontend usan el runner de Node y no añaden dependencias.
