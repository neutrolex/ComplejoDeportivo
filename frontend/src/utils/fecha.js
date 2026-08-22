export function formatearFecha(fecha) {
  const year = fecha.getFullYear()
  const month = String(fecha.getMonth() + 1).padStart(2, '0')
  const day = String(fecha.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function parsearFecha(fechaTexto) {
  const [year, month, day] = fechaTexto.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function sumarDias(fechaTexto, dias) {
  const fecha = parsearFecha(fechaTexto)
  fecha.setDate(fecha.getDate() + dias)
  return formatearFecha(fecha)
}

// Lunes de la semana que contiene fechaTexto. getDay() devuelve 0=domingo,
// 1=lunes, ..., 6=sabado -- el offset lleva cualquier dia de vuelta al
// lunes de esa misma semana.
export function lunesDeLaSemana(fechaTexto) {
  const fecha = parsearFecha(fechaTexto)
  const diaSemana = fecha.getDay()
  const offset = diaSemana === 0 ? -6 : 1 - diaSemana
  fecha.setDate(fecha.getDate() + offset)
  return formatearFecha(fecha)
}

export const NOMBRES_DIA = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom']
