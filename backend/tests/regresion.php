<?php
declare(strict_types=1);

// Base efimera: nunca carga config/database.php ni las credenciales locales.
require __DIR__ . '/../src/Support/autoload.php';

use App\Services\ComentarioDiaService;
use App\Services\DeudaService;
use App\Services\ReservaService;
use App\Support\HttpException;

function obtenerConexionPDO(): PDO {
    static $pdo;
    return $pdo ??= new PDO('sqlite::memory:', null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_STRINGIFY_FETCHES => true,
    ]);
}
function igual($actual, $esperado, string $mensaje): void {
    if ($actual !== $esperado) throw new RuntimeException($mensaje . ': ' . var_export($actual, true));
}
function monto($actual, string $esperado): void { igual(bcadd((string) $actual, '0', 2), $esperado, 'Monto'); }
function rechaza(callable $operacion, string $mensaje, int $status): void {
    try { $operacion(); } catch (HttpException $e) {
        igual($e->getMessage(), $mensaje, 'Mensaje HTTP'); igual($e->status(), $status, 'Status HTTP'); return;
    }
    throw new RuntimeException('Se esperaba HttpException');
}
$pdo = obtenerConexionPDO();
$pdo->exec("CREATE TABLE academias (id INTEGER PRIMARY KEY, nombre TEXT, tipo TEXT, color TEXT, permiso_mostrar INTEGER, deuda_actual NUMERIC);
CREATE TABLE academia_horarios (id INTEGER PRIMARY KEY, academia_id INTEGER, dia_semana INTEGER, hora_inicio TEXT, hora_fin TEXT);
CREATE TABLE academia_horario_canchas (academia_horario_id INTEGER, cancha_id INTEGER);
CREATE TABLE reservas (id INTEGER PRIMARY KEY, modalidad TEXT, cliente_nombre TEXT, fecha TEXT, hora_inicio TEXT, hora_fin TEXT, estado TEXT, precio_total TEXT, academia_id INTEGER, academia_horario_id INTEGER, asignada_por_id INTEGER, es_adelanto INTEGER, estado_pago TEXT);
CREATE TABLE reserva_canchas (reserva_id INTEGER, cancha_id INTEGER);
CREATE TABLE pagos (id INTEGER PRIMARY KEY, reserva_id INTEGER, tipo TEXT, monto TEXT, metodo TEXT, registrado_por_id INTEGER, fecha_hora TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE comentarios_dia (id INTEGER PRIMARY KEY, fecha TEXT, texto TEXT, monto_yape TEXT, monto_efectivo TEXT, creado_por_id INTEGER, academia_id INTEGER, academia_deuda_resultante TEXT, cuenta_en_total INTEGER, creado_en TEXT DEFAULT CURRENT_TIMESTAMP);
INSERT INTO academias VALUES (1, 'Escuela', 'academia', '#123456', 1, 100);
INSERT INTO reservas VALUES (1, 'individual', 'Escuela', '2026-09-09', '23:00', '00:00', 'confirmada', '100.00', 1, NULL, 1, 1, 'pendiente');
INSERT INTO reserva_canchas VALUES (1, 1);");

// Protege deposito y fecha original al editar/borrar solo el saldo.
ReservaService::guardarPago(1, 'yape', '25.00', 1, 'adelanto');
$pdo->exec("UPDATE pagos SET fecha_hora = '2026-09-08 10:00:00'");
ReservaService::actualizarSaldo(1, 'yape', '30.00', 1);
ReservaService::actualizarSaldo(1, 'yape', '40.00', 1);
ReservaService::actualizarSaldo(1, 'yape', '0.00', 1);
igual($pdo->query('SELECT COUNT(*) FROM pagos')->fetchColumn(), '1', 'Solo queda deposito');
$deposito = $pdo->query('SELECT * FROM pagos')->fetch();
igual($deposito['tipo'], 'adelanto', 'Tipo original');
igual($deposito['fecha_hora'], '2026-09-08 10:00:00', 'Fecha original');
monto($deposito['monto'], '25.00');
echo "OK deposito y saldo\n";

igual(class_exists(DeudaService::class), true, 'Existe servicio de deuda');
$resultado = DeudaService::marcarDeuda(1, ['monto' => '35.50'], 1);
igual(array_keys($resultado), ['reserva', 'academia'], 'Contrato deuda');
igual($resultado['reserva']['estado'], 'debe', 'Estado deuda');
monto($resultado['academia']['deuda_actual'], '135.50');
igual(ReservaService::resumenPagosPorFecha('2026-09-09')['total_general'], '0.00', 'La deuda no es ingreso');
rechaza(fn() => DeudaService::marcarDeuda(1, ['monto' => 0], 1), 'monto debe ser un numero mayor a 0.', 400);
rechaza(fn() => DeudaService::marcarDeuda(999, ['monto' => 10], 1), 'Reserva no encontrada.', 404);
echo "OK registro de deuda y validaciones\n";

$entrada = ['fecha' => '2026-09-09', 'texto' => 'Pago escuela', 'monto_yape' => '20.00', 'monto_efectivo' => '10.00', 'academia_id' => 1];
$comentario = ComentarioDiaService::crear($entrada, 1);
monto($comentario['academia_deuda_resultante'], '105.50');
monto($pdo->query('SELECT deuda_actual FROM academias')->fetchColumn(), '105.50');
$editado = ComentarioDiaService::actualizar($comentario['id'], [...$entrada, 'monto_yape' => '40.00']);
monto($editado['academia_deuda_resultante'], '85.50');
$editado = ComentarioDiaService::actualizar($comentario['id'], [...$entrada, 'monto_yape' => '5.00']);
monto($editado['academia_deuda_resultante'], '120.50');
ComentarioDiaService::eliminar($comentario['id']);
monto($pdo->query('SELECT deuda_actual FROM academias')->fetchColumn(), '135.50');
igual(ReservaService::resumenPagosPorFecha('2026-09-09')['total_general'], '0.00', 'Eliminar revierte ingreso');
echo "OK crear, aumentar, reducir y eliminar pago de academia\n";

// Fallo real SQL luego del ajuste: debe revertirse la transaccion entera.
$pdo->exec("CREATE TRIGGER fallo_comentario BEFORE INSERT ON comentarios_dia BEGIN SELECT RAISE(ABORT, 'fallo inducido'); END;");
$pdo->exec("UPDATE reservas SET estado = 'confirmada' WHERE id = 1");
foreach ([fn() => DeudaService::marcarDeuda(1, ['monto' => 15], 1), fn() => ComentarioDiaService::crear($entrada, 1)] as $operacion) {
    try { $operacion(); throw new RuntimeException('Faltaba fallo SQL'); }
    catch (PDOException $e) { igual(str_contains($e->getMessage(), 'fallo inducido'), true, 'Fallo esperado'); }
    monto($pdo->query('SELECT deuda_actual FROM academias')->fetchColumn(), '135.50');
    igual($pdo->query('SELECT estado FROM reservas WHERE id = 1')->fetchColumn(), 'confirmada', 'Rollback estado');
    igual($pdo->inTransaction(), false, 'Transaccion cerrada');
}
echo "OK rollback de deuda y pago\n";
$pdo->exec('DROP TRIGGER fallo_comentario');

$comentario = ComentarioDiaService::crear($entrada, 1);
foreach (['UPDATE', 'DELETE'] as $evento) {
    $pdo->exec("CREATE TRIGGER fallo_edicion BEFORE $evento ON comentarios_dia BEGIN SELECT RAISE(ABORT, 'fallo inducido'); END;");
    try {
        if ($evento === 'UPDATE') ComentarioDiaService::actualizar($comentario['id'], [...$entrada, 'monto_yape' => '90.00']);
        else ComentarioDiaService::eliminar($comentario['id']);
        throw new RuntimeException('Faltaba fallo SQL');
    } catch (PDOException $e) { igual(str_contains($e->getMessage(), 'fallo inducido'), true, 'Fallo esperado'); }
    monto($pdo->query('SELECT deuda_actual FROM academias')->fetchColumn(), '105.50');
    monto($pdo->query('SELECT SUM(monto_yape) FROM comentarios_dia')->fetchColumn(), '20.00');
    igual($pdo->inTransaction(), false, 'Transaccion cerrada');
    $pdo->exec('DROP TRIGGER fallo_edicion');
}
echo "OK rollback de edicion y eliminacion\n";

rechaza(fn() => ComentarioDiaService::actualizar($comentario['id'], [...$entrada, 'monto_yape' => '-1']), 'monto_yape debe ser un numero valido, no negativo (hasta 2 decimales).', 400);
rechaza(fn() => ComentarioDiaService::eliminar(999), 'Comentario no encontrado.', 404);
$pdo->exec('UPDATE reservas SET academia_id = NULL WHERE id = 1');
rechaza(fn() => DeudaService::marcarDeuda(1, ['monto' => 10], 1), 'Esta reserva no tiene una academia asociada.', 400);
$pdo->exec('UPDATE reservas SET academia_id = 999 WHERE id = 1');
rechaza(fn() => DeudaService::marcarDeuda(1, ['monto' => 10], 1), 'La academia de esta reserva ya no existe.', 404);
$pdo->exec('UPDATE reservas SET academia_id = 1 WHERE id = 1');

// Un comentario ordinario no modifica deuda; la nota de adelanto no duplica ingresos.
ComentarioDiaService::crear([...$entrada, 'academia_id' => null, 'monto_yape' => '5.00', 'monto_efectivo' => '0.00'], 1);
monto($pdo->query('SELECT deuda_actual FROM academias')->fetchColumn(), '105.50');
(new App\Models\ComentarioDia())->crear('2026-09-08', 'Nota adelanto', '25.00', '0.00', 1, null, null, false);
igual(ReservaService::resumenPagosPorFecha('2026-09-08')['total_general'], '25.00', 'Adelanto contado una vez');
igual(ReservaService::resumenPagosPorFecha('2026-09-09')['total_general'], '35.00', 'Pagos de academia y comentario');

// Se preserva el saldo manual: puede quedar credito y no se recalculan fotos antiguas.
$editado = ComentarioDiaService::actualizar($comentario['id'], [...$entrada, 'monto_yape' => '200.00']);
monto($editado['academia_deuda_resultante'], '-74.50');
ComentarioDiaService::eliminar($comentario['id']);
monto($pdo->query('SELECT deuda_actual FROM academias')->fetchColumn(), '135.50');
echo "OK validaciones, totales por fecha y saldo negativo\n";
