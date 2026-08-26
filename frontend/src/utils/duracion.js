export const OPCIONES_DURACION = [1, 1.5]

export function etiquetaDuracion(horas) {
  const enteras = Math.floor(horas)
  return horas % 1 === 0.5 ? `${enteras}h 30min` : `${enteras}h`
}

export function calcularHoraFin(horaInicio, duracionHoras) {
  const [h, m] = horaInicio.split(':').map(Number)
  const totalMin = (h * 60 + m + duracionHoras * 60) % (24 * 60)
  const hh = Math.floor(totalMin / 60)
  const mm = totalMin % 60
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}
