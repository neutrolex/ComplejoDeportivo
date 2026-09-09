export function montosDeReserva(reserva) {
  const suma = (metodo) =>
    reserva.pagos.filter((p) => p.metodo === metodo).reduce((acc, p) => acc + Number(p.monto), 0)
  return { yape: suma('yape'), efectivo: suma('efectivo') }
}

// Igual que montosDeReserva pero de un solo tipo de Pago -- 'adelanto' es
// siempre el deposito original (se crea una unica vez, al armar la
// reserva); 'saldo' es cualquier pago posterior (incluido el que se
// completa en otro dia via /agregar-pago/). Separarlos es lo que permite
// que la tarjeta del adelanto se quede fija con el deposito original sin
// que un pago posterior la modifique.
export function montosDeReservaPorTipo(reserva, tipo) {
  const suma = (metodo) =>
    reserva.pagos
      .filter((p) => p.metodo === metodo && p.tipo === tipo)
      .reduce((acc, p) => acc + Number(p.monto), 0)
  return { yape: suma('yape'), efectivo: suma('efectivo') }
}
