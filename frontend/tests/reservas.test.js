import test from 'node:test'
import assert from 'node:assert/strict'
import { generarBloques, horaTexto, construirGrilla } from '../src/modules/reservas/horarios.js'
import { montosDeReserva, montosDeReservaPorTipo } from '../src/modules/reservas/pagos.js'

test('los bloques cubren media hora hasta medianoche', () => {
  assert.deepEqual(generarBloques([]), [])
  assert.deepEqual(generarBloques([{ hora_inicio: '22:00' }]), [22, 22.5, 23, 23.5])
  assert.equal(horaTexto(23.5), '23:30')
})

test('una reserva de 90 minutos termina a medianoche y deja libre otra cancha', () => {
  const reserva = { modalidad: 'individual', hora_inicio: '22:30', hora_fin: '00:00', canchas: [1] }
  const grilla = construirGrilla([22, 22.5, 23, 23.5], [{ id: 1 }, { id: 2 }], [reserva])
  assert.deepEqual(grilla[1].map(c => c.tipo), ['libre', 'inicio', 'cubierto', 'cubierto'])
  assert.equal(grilla[1][1].rowSpan, 3)
  assert.equal(grilla[1][1].reserva, reserva)
  assert.ok(grilla[2].every(c => c.tipo === 'libre'))
})

test('campo completo bloquea todas las canchas y limita rowSpan al rango visible', () => {
  const reserva = { modalidad: 'completo', hora_inicio: '23:00:00', hora_fin: '00:00:00' }
  const grilla = construirGrilla([23, 23.5], [{ id: 1 }, { id: 2 }], [reserva])
  assert.equal(grilla.completo[0].rowSpan, 2)
  assert.equal(grilla.completo[1].tipo, 'cubierto')
  assert.ok(grilla[1].every(c => c.tipo === 'bloqueada'))
  assert.ok(grilla[2].every(c => c.tipo === 'bloqueada'))
})

test('el saldo posterior no cambia los montos del adelanto original', () => {
  const reserva = { pagos: [
    { metodo: 'yape', tipo: 'adelanto', monto: '25.50' },
    { metodo: 'efectivo', tipo: 'adelanto', monto: '10.00' },
    { metodo: 'yape', tipo: 'saldo', monto: '30.00' },
  ] }
  assert.deepEqual(montosDeReserva(reserva), { yape: 55.5, efectivo: 10 })
  assert.deepEqual(montosDeReservaPorTipo(reserva, 'adelanto'), { yape: 25.5, efectivo: 10 })
  assert.deepEqual(montosDeReservaPorTipo(reserva, 'saldo'), { yape: 30, efectivo: 0 })
  assert.deepEqual(montosDeReserva({ pagos: [] }), { yape: 0, efectivo: 0 })
})
