export function generarBloques(tarifas) {
  if (tarifas.length === 0) return []
  const horaInicio = Math.min(...tarifas.map((t) => Number(t.hora_inicio.slice(0, 2))))
  const bloques = []
  for (let b = horaInicio; b <= 23.5; b += 0.5) bloques.push(b)
  return bloques
}

export function horaTexto(bloque) {
  const horas = Math.floor(bloque)
  const minutos = bloque % 1 === 0 ? '00' : '30'
  return `${String(horas).padStart(2, '0')}:${minutos}`
}

export function aDecimal(horaStr) {
  const [h, m] = horaStr.split(':').map(Number)
  return h + m / 60
}

// hora_fin='00:00:00' significa 'medianoche = fin del dia operativo'
// (mismo criterio que el backend) -- para calcular cuantos bloques ocupa
// una reserva hay que tratarlo como 24, no como 0.
export function finADecimal(horaStr) {
  const valor = aDecimal(horaStr)
  return valor === 0 ? 24 : valor
}

export function rangoTexto(reserva) {
  const fin = reserva.hora_fin === '00:00:00' ? '00:00' : reserva.hora_fin.slice(0, 5)
  return `${reserva.hora_inicio.slice(0, 5)}–${fin}`
}

// Arma, por cada columna (cancha o 'completo'), el estado de cada bloque:
// 'inicio' (primer bloque de una reserva, se renderiza con rowSpan),
// 'cubierto' (bloque absorbido por el rowSpan de una reserva que empezo
// antes, no se renderiza ningun <td>), 'bloqueada' (una cancha individual
// tapada por una reserva de campo completo) o 'libre'.
export function construirGrilla(bloques, canchas, reservas) {
  const indice = new Map(bloques.map((b, i) => [b, i]))
  const grilla = {}
  canchas.forEach((c) => { grilla[c.id] = bloques.map(() => ({ tipo: 'libre' })) })
  grilla.completo = bloques.map(() => ({ tipo: 'libre' }))

  for (const r of reservas.filter((x) => x.modalidad !== 'completo')) {
    const idxInicio = indice.get(aDecimal(r.hora_inicio))
    if (idxInicio === undefined) continue
    const rowSpan = Math.min(
      Math.round((finADecimal(r.hora_fin) - aDecimal(r.hora_inicio)) / 0.5),
      bloques.length - idxInicio,
    )
    for (const canchaId of r.canchas) {
      for (let i = 0; i < rowSpan; i++) {
        grilla[canchaId][idxInicio + i] = i === 0 ? { tipo: 'inicio', reserva: r, rowSpan } : { tipo: 'cubierto' }
      }
    }
  }

  for (const r of reservas.filter((x) => x.modalidad === 'completo')) {
    const idxInicio = indice.get(aDecimal(r.hora_inicio))
    if (idxInicio === undefined) continue
    const rowSpan = Math.min(
      Math.round((finADecimal(r.hora_fin) - aDecimal(r.hora_inicio)) / 0.5),
      bloques.length - idxInicio,
    )
    for (let i = 0; i < rowSpan; i++) {
      const idx = idxInicio + i
      grilla.completo[idx] = i === 0 ? { tipo: 'inicio', reserva: r, rowSpan } : { tipo: 'cubierto' }
      canchas.forEach((c) => { grilla[c.id][idx] = { tipo: 'bloqueada' } })
    }
  }

  return grilla
}
