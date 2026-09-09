# Esquema y actualizaciones

`schema.sql` representa el esquema completo actual. Es para una instalación nueva: contiene `DROP TABLE` y no debe importarse sobre una base con datos que se quieran conservar. Ya incluye los seis cambios siguientes; después de importarlo no se ejecutan otra vez los incrementales.

Para una base anterior a estos cambios, aplicar únicamente las actualizaciones pendientes, una sola vez, en este orden explícito (no en orden alfabético):

| Orden | Archivo | Cambio |
| --- | --- | --- |
| 1 | `actualizacion_2026-09-06_deuda_inventario.sql` | Deuda de academia, vínculo de comentarios a academia e inventario |
| 2 | `actualizacion_2026-09-06_2_estado_debe.sql` | Estado `debe` de reservas |
| 3 | `actualizacion_2026-09-06_3_deuda_resultante.sql` | Foto del saldo después de un pago |
| 4 | `actualizacion_2026-09-06_4_estado_pago.sql` | Estado de pago manual de adelantos |
| 5 | `actualizacion_2026-09-06_5_cuenta_en_total.sql` | Exclusión de notas informativas del total |
| 6 | `actualizacion_2026-09-06_6_tipo_academia.sql` | Distinción de academia y cliente fijo |

Los nombres y contenidos históricos se conservan para no romper referencias ni registros de despliegues existentes. No hay un ejecutor automático ni una tabla de migraciones aplicadas. Antes de ejecutar SQL, comprobar el historial de la instalación y las columnas/tablas existentes mediante `SHOW CREATE TABLE`; si un archivo se aplicó parcialmente, revisar sus sentencias individualmente. Los `ADD COLUMN` no son idempotentes. Hacer copia de seguridad antes de cualquier actualización.

Esta reorganización no requiere cambios de esquema ni ejecuta migraciones.
