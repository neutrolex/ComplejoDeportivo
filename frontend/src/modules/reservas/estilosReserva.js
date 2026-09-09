// La mezcla de color se hace sobre blanco en modo claro y sobre un slate
// bien oscuro en modo oscuro -- mezclar siempre con blanco daria, en modo
// oscuro, una celda pastel clara que desentona con el resto de la grilla.
export function estiloAcademia(reserva, oscuro) {
  if (!reserva.academia) return {}
  const color = reserva.academia.color
  const base = oscuro ? '#0f172a' : 'white'
  // Mezclas mas bajas que antes (fondo y borde): se nota que la tarjeta
  // tiene un color propio sin llegar a competir con el nombre/badges que
  // van encima.
  return {
    backgroundColor: `color-mix(in srgb, ${color} ${oscuro ? '16%' : '8%'}, ${base})`,
    borderColor: `color-mix(in srgb, ${color} ${oscuro ? '38%' : '28%'}, ${base})`,
  }
}

export function colorTextoAcademia(reserva) {
  return reserva.academia ? { color: reserva.academia.color } : {}
}
