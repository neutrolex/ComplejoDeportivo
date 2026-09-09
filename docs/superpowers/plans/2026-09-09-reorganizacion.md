# Reorganización del proyecto PHP

**Objetivo:** separar responsabilidades conservando UI, rutas, respuestas y reglas de negocio del commit 0e3c739.
**Arquitectura:** módulos frontend por dominio; servicios PHP para deuda y comentarios; modelos y SQL existentes sin cambios funcionales.
**Stack:** React/Vite, PHP/PDO, MySQL. Ejecución inline en codex/reorganizacion-php.

- [x] Caracterizar grilla, adelantos, deuda y pagos con Node test y PHP/PDO SQLite en memoria, sin conexión a datos reales.
- [x] Mover componentes a modules/reservas, horarios-fijos, inventario, finanzas, comentarios, disponibilidad y auth. Mantener components/ui, calendario, confirmación y layout compartidos. Reescribir imports relativos según destino.
- [x] Extraer funciones de horarios a reservas/horarios.js, sumas de pagos a reservas/pagos.js y presentación de celdas a reservas/CeldasReserva.jsx sin modificar JSX.
- [x] Sustituir cuatro wrappers idénticos por PanelConLogin({ children }), conservando las rutas y el montaje por página.
- [x] Extraer marcarDeuda(id, datos, usuarioId) a DeudaService, y crear/actualizar/eliminar comentarios a ComentarioDiaService. Conservar orden de validación, aritmética y fronteras transaccionales.
- [x] Documentar orden explícito de los seis SQL incrementales, diferenciando instalación nueva y existente; conservar archivos SQL intactos.
- [x] Ejecutar pruebas de regresión, build, lint, php -l y git diff --check. Revisar diferencias y reportar límites de SQLite frente a MySQL. Sin push ni despliegue.

Validación final: 4 pruebas Node y 6 grupos de regresión PHP correctos; build correcto (aviso de bundle >500 kB); lint sin errores y los mismos 12 avisos del original; sintaxis PHP y diff --check correctos. Revisión independiente sin hallazgos nuevos. No se probaron navegador ni MySQL real.
