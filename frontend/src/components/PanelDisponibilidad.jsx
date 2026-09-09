import { Fragment, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Clock, Wallet } from 'lucide-react'
import { apiFetch } from '../api'
import { useTheme } from '../context/ThemeContext'
import { formatearFecha, formatearFechaLarga, sumarDias } from '../utils/fecha'
import CalendarioPopover from './CalendarioPopover'
import { Badge } from './ui/badge'
import ComentariosDia from './ComentariosDia'
import ReservaDialogo from './ReservaDialogo'
import TotalDelDia from './TotalDelDia'

function generarBloques(tarifas) {
  if (tarifas.length === 0) return []
  const horaInicio = Math.min(...tarifas.map((t) => Number(t.hora_inicio.slice(0, 2))))
  const bloques = []
  for (let b = horaInicio; b <= 23.5; b += 0.5) bloques.push(b)
  return bloques
}

function horaTexto(bloque) {
  const horas = Math.floor(bloque)
  const minutos = bloque % 1 === 0 ? '00' : '30'
  return `${String(horas).padStart(2, '0')}:${minutos}`
}

function aDecimal(horaStr) {
  const [h, m] = horaStr.split(':').map(Number)
  return h + m / 60
}

// hora_fin='00:00:00' significa 'medianoche = fin del dia operativo'
// (mismo criterio que el backend) -- para calcular cuantos bloques ocupa
// una reserva hay que tratarlo como 24, no como 0.
function finADecimal(horaStr) {
  const valor = aDecimal(horaStr)
  return valor === 0 ? 24 : valor
}

function rangoTexto(reserva) {
  const fin = reserva.hora_fin === '00:00:00' ? '00:00' : reserva.hora_fin.slice(0, 5)
  return `${reserva.hora_inicio.slice(0, 5)}–${fin}`
}

function montosDeReserva(reserva) {
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
function montosDeReservaPorTipo(reserva, tipo) {
  const suma = (metodo) =>
    reserva.pagos
      .filter((p) => p.metodo === metodo && p.tipo === tipo)
      .reduce((acc, p) => acc + Number(p.monto), 0)
  return { yape: suma('yape'), efectivo: suma('efectivo') }
}

// La mezcla de color se hace sobre blanco en modo claro y sobre un slate
// bien oscuro en modo oscuro -- mezclar siempre con blanco daria, en modo
// oscuro, una celda pastel clara que desentona con el resto de la grilla.
function estiloAcademia(reserva, oscuro) {
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

function colorTextoAcademia(reserva) {
  return reserva.academia ? { color: reserva.academia.color } : {}
}

// Etiqueta del estado_pago (Pendiente/Pagado/Falta), variant de Badge().
const VARIANTE_ESTADO_PAGO = { pendiente: 'pendiente', pagado: 'pagado', falta: 'falta' }
const TEXTO_ESTADO_PAGO = { pendiente: 'Pendiente', pagado: 'Pagado', falta: 'Falta' }

function BadgesPago({ reserva }) {
  // El deposito original de un adelanto vive solo en su tarjeta (ver
  // EtiquetaAdelanto) y no se recalcula nunca de ahi. Lo que se cobra
  // despues (tipo='saldo', incluido lo agregado en otro dia via
  // /agregar-pago/) aparece aca -- junto al estado_pago manual, ya que el
  // precio real puede variar (negociacion, horario) y "cuanto falta" lo
  // decide a mano la persona a cargo, no la app.
  if (reserva.es_adelanto) {
    const { yape, efectivo } = montosDeReservaPorTipo(reserva, 'saldo')
    return (
      <div className="flex flex-col items-start gap-1">
        <Badge variant={VARIANTE_ESTADO_PAGO[reserva.estado_pago]}>{TEXTO_ESTADO_PAGO[reserva.estado_pago]}</Badge>
        {yape > 0 && <Badge variant="yape">Yape S/{yape.toFixed(2)}</Badge>}
        {efectivo > 0 && <Badge variant="efectivo">Efectivo S/{efectivo.toFixed(2)}</Badge>}
      </div>
    )
  }

  // Solo se muestra el metodo que realmente tiene monto cargado -- si pago
  // 50 en Yape y nada en Efectivo, se ve unicamente "Yape S/50.00" (antes
  // se mostraban los dos aunque uno quedara en S/0.00). "Pendiente" solo
  // cuando no hay ningun pago cargado.
  const { yape, efectivo } = montosDeReserva(reserva)
  if (yape === 0 && efectivo === 0) {
    return <Badge variant="pendiente">{reserva.estado === 'debe' ? 'Debe (deuda registrada)' : 'Pendiente'}</Badge>
  }
  return (
    <div className="flex flex-col items-start gap-1">
      {yape > 0 && <Badge variant="yape">Yape S/{yape.toFixed(2)}</Badge>}
      {efectivo > 0 && <Badge variant="efectivo">Efectivo S/{efectivo.toFixed(2)}</Badge>}
    </div>
  )
}

// Columna "Pago" propia al costado de cada cancha (y de Campo completo): el
// estado de pago y el de "no vino" viven ahi, no adentro de la tarjeta de
// la reserva -- asi la tarjeta se queda solo con nombre+hora (2 lineas,
// entra comoda hasta en un bloque de 30min) y no hace falta un modo
// compacto especial que antes deformaba la fila.
//
// La celda entera es un boton que abre el dialogo de editar (igual que la
// tarjeta de al lado): nada de auto-cobrar un monto con un solo clic --
// cargar cuanto pago, en que metodo, o marcar "no vino" se hace a mano
// adentro del dialogo.
function CeldaEstado({ reserva, rowSpan, etiquetaCancha, onAbrir }) {
  const ausente = reserva.estado === 'ausente'
  return (
    <td rowSpan={rowSpan} className="px-2 py-1.5 align-top">
      <button
        type="button"
        onClick={() => onAbrir(reserva, etiquetaCancha)}
        title="Editar pago"
        className="flex h-full w-full flex-col items-start justify-center gap-1 text-left"
        style={{ minHeight: `${rowSpan * 2.5}rem` }}
      >
        {/* "No vino" reemplaza el badge de pago/estado -- una vez marcada
            ausente, el estado de pago deja de ser lo relevante a simple
            vista en la columna. */}
        {ausente ? <Badge variant="ausente">No vino</Badge> : <BadgesPago reserva={reserva} />}
      </button>
    </td>
  )
}

// Adelanto = reserva creada por el flujo "Agregar adelanto": ya no se
// distingue pintando la tarjeta entera de negro (competia con el resto de
// la grilla y tapaba el color de academia). En su lugar se identifica con
// esta unica etiqueta oscura ("negro") dentro de la tarjeta -- el mismo
// dato NO se repite en la columna de Pago (ver BadgesPago) para que no se
// vea el monto dos veces. El prefijo "Adelanto" es a proposito: este monto
// es una sena, no el pago completo de la reserva.
function EtiquetaAdelanto({ reserva }) {
  // Fijo al deposito original (tipo='adelanto') a proposito: un pago
  // posterior (tipo='saldo', ver BadgesPago) no debe modificar esta
  // tarjeta -- el adelanto queda como una foto de lo que se cobro al
  // reservar, sin importar cuanto se cobre despues.
  const { yape, efectivo } = montosDeReservaPorTipo(reserva, 'adelanto')
  if (yape === 0 && efectivo === 0) return null
  const total = yape + efectivo
  const metodo = yape > 0 && efectivo > 0 ? 'Yape + Efectivo' : yape > 0 ? 'Yape' : 'Efectivo'
  return (
    <div className="flex items-center gap-1 text-xs font-bold text-slate-900 dark:text-slate-50">
      <Wallet className="h-3 w-3" />
      Adelanto S/{total.toFixed(2)} · {metodo}
    </div>
  )
}

function ContenidoReserva({ reserva, extra }) {
  return (
    <>
      <div className="flex w-full min-w-0 items-center gap-2">
        {/* cliente_nombre es una foto del nombre al momento de materializar:
            si la academia se renombro despues, la celda mostraria el nombre
            viejo con el color nuevo. Se prefiere el nombre vivo de la
            academia y se cae a cliente_nombre para reservas sin academia. */}
        <span className="min-w-0 truncate font-semibold text-rose-700 dark:text-rose-300" style={colorTextoAcademia(reserva)}>
          {reserva.academia?.nombre ?? reserva.cliente_nombre}
        </span>
        {extra}
      </div>
      {reserva.es_adelanto && <EtiquetaAdelanto reserva={reserva} />}
      <span className="flex items-center gap-1 text-xs text-rose-500 dark:text-rose-400">
        <Clock className="h-3 w-3" />
        {rangoTexto(reserva)}
      </span>
    </>
  )
}

// Arma, por cada columna (cancha o 'completo'), el estado de cada bloque:
// 'inicio' (primer bloque de una reserva, se renderiza con rowSpan),
// 'cubierto' (bloque absorbido por el rowSpan de una reserva que empezo
// antes, no se renderiza ningun <td>), 'bloqueada' (una cancha individual
// tapada por una reserva de campo completo) o 'libre'.
function construirGrilla(bloques, canchas, reservas) {
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

const ANIMADO = { animation: 'fade-slide-up 280ms cubic-bezier(0.16, 1, 0.3, 1) both' }

export default function PanelDisponibilidad() {
  const { tema } = useTheme()
  const oscuro = tema === 'oscuro'
  const [fecha, setFecha] = useState(formatearFecha(new Date()))
  const [canchas, setCanchas] = useState([])
  const [tarifas, setTarifas] = useState([])
  const [reservas, setReservas] = useState([])
  const [academias, setAcademias] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [dialogoContexto, setDialogoContexto] = useState(null)
  // Se incrementa con cualquier accion que pueda afectar datos que otros
  // paneles calculan por su cuenta (Total del dia, Adelantos pendientes) --
  // esos paneles lo usan para refrescarse solos en vez de necesitar F5.
  const [version, setVersion] = useState(0)
  const notificarCambio = () => setVersion((v) => v + 1)

  useEffect(() => {
    let vigente = true
    async function cargarDatos() {
      setCargando(true)
      setError('')
      setDialogoContexto(null)
      try {
        const [canchasData, tarifasData, reservasData, academiasData] = await Promise.all([
          apiFetch('/canchas/'),
          apiFetch('/tarifas/'),
          apiFetch(`/reservas/?fecha=${fecha}`),
          apiFetch('/academias/'),
        ])
        if (!vigente) return
        setCanchas(canchasData)
        setTarifas(tarifasData)
        setReservas(reservasData)
        setAcademias(academiasData)
      } catch (err) {
        if (!vigente) return
        setError(err.message)
      } finally {
        if (vigente) setCargando(false)
      }
    }
    cargarDatos()
    return () => { vigente = false }
  }, [fecha])

  function abrirCrear(bloque, cancha) {
    setDialogoContexto({
      modo: 'crear', fecha, horaInicio: horaTexto(bloque), modalidad: 'individual',
      canchaIds: [cancha.id], etiquetaCancha: `Cancha ${cancha.numero}`,
    })
  }

  function abrirCrearCompleto(bloque) {
    setDialogoContexto({
      modo: 'crear', fecha, horaInicio: horaTexto(bloque), modalidad: 'completo',
      canchaIds: canchas.map((c) => c.id), etiquetaCancha: 'Campo completo',
    })
  }

  function abrirEditar(reserva, etiquetaCancha) {
    setDialogoContexto({ modo: 'editar', reserva, horaInicio: reserva.hora_inicio, etiquetaCancha })
  }

  function onGuardada(reservaGuardada) {
    setReservas((anteriores) => {
      const existe = anteriores.some((r) => r.id === reservaGuardada.id)
      return existe
        ? anteriores.map((r) => (r.id === reservaGuardada.id ? reservaGuardada : r))
        : [...anteriores, reservaGuardada]
    })
    notificarCambio()
  }

  function onCancelada(id) {
    setReservas((anteriores) => anteriores.filter((r) => r.id !== id))
    notificarCambio()
  }

  function onAdelantoCreadoEnGrilla(reservaCreada) {
    if (reservaCreada.fecha === fecha) onGuardada(reservaCreada)
  }

  // POST /reservas/{id}/marcar-deuda/ devuelve la reserva (estado='debe')
  // y la academia (deuda_actual ya sumada) juntas -- se aplican los dos a
  // la vez para que la grilla y cualquier dialogo abierto con esa academia
  // queden al dia sin recargar la pagina.
  function onDeudaRegistrada({ reserva, academia }) {
    onGuardada(reserva)
    setAcademias((anteriores) => anteriores.map((a) => (a.id === academia.id ? academia : a)))
  }

  // El backend ya devuelve el saldo resultante (academia_deuda_resultante)
  // en el propio comentario -- se copia tal cual en vez de recalcularlo aca
  // (recalcular se rompería al editar un pago existente, donde el ajuste
  // real es una diferencia entre el monto viejo y el nuevo, no el monto
  // completo del formulario).
  function onPagoAcademia(comentario) {
    if (!comentario.academia || comentario.academia_deuda_resultante === null) return
    setAcademias((anteriores) => anteriores.map((a) => (
      a.id === comentario.academia.id
        ? { ...a, deuda_actual: comentario.academia_deuda_resultante }
        : a
    )))
    notificarCambio()
  }

  const bloques = generarBloques(tarifas)
  const grilla = construirGrilla(bloques, canchas, reservas)

  return (
    <div>
      <div className="mb-5 flex items-center justify-between" style={ANIMADO}>
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Reservas</h2>
          <div
            key={fecha}
            className="mt-1 flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400"
            style={{ animation: 'fade-slide-up 220ms cubic-bezier(0.16, 1, 0.3, 1) both' }}
          >
            <span aria-hidden="true">📅</span>
            <span>{formatearFechaLarga(fecha)}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setFecha((f) => sumarDias(f, -1))}
            aria-label="Día anterior"
            className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <CalendarioPopover fecha={fecha} onSeleccionar={setFecha} />
          <button
            type="button"
            onClick={() => setFecha((f) => sumarDias(f, 1))}
            aria-label="Día siguiente"
            className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex gap-6">
        <div className="min-w-0 flex-1">
          {error && <p className="text-red-600 dark:text-red-400">{error}</p>}
          {/* Solo se muestra "Cargando..." la primerísima vez (antes de tener
              ninguna cancha todavía). En cambios de fecha posteriores la
              grilla se queda a la vista y solo se atenua -- reemplazarla de
              golpe por "Cargando..." es lo que se sentía brusco. */}
          {!error && cargando && canchas.length === 0 && <p className="dark:text-slate-300">Cargando...</p>}

          {!error && canchas.length > 0 && (
            <div
              className={`max-h-[68vh] overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm transition-opacity duration-300 dark:border-slate-800 dark:bg-slate-900 ${
                cargando ? 'pointer-events-none opacity-40' : 'opacity-100'
              }`}
              style={{ ...ANIMADO, animationDelay: '60ms' }}
            >
              {/* Sin w-full: con 5 pares cancha+estado no entran comodos en el
                  ancho del panel -- se le da a cada columna un ancho fijo
                  propio (mas del que entra) y el contenedor de arriba
                  (overflow-auto) scrollea horizontal en vez de aplastarlas
                  todas hasta volverlas ilegibles. */}
              <table className="table-fixed border-collapse text-sm">
                <colgroup>
                  <col className="w-16" />
                  {canchas.map((c) => (
                    <Fragment key={c.id}>
                      <col className="w-40" />
                      <col className="w-28" />
                    </Fragment>
                  ))}
                  <col className="w-44" />
                  <col className="w-28" />
                </colgroup>
                <thead>
                  <tr className="bg-slate-800 text-white dark:bg-slate-950">
                    <th className="sticky top-0 z-10 bg-slate-800 px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide dark:bg-slate-950">Hora</th>
                    {canchas.map((c) => (
                      <Fragment key={c.id}>
                        <th className="sticky top-0 z-10 truncate bg-slate-800 px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide dark:bg-slate-950">
                          Cancha {c.numero}
                        </th>
                        <th className="sticky top-0 z-10 truncate bg-slate-800 px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide dark:bg-slate-950">
                          Pago
                        </th>
                      </Fragment>
                    ))}
                    <th className="sticky top-0 z-10 truncate bg-slate-800 px-3 py-2.5 text-left text-xs font-semibold uppercase dark:bg-slate-950">Campo completo</th>
                    <th className="sticky top-0 z-10 truncate bg-slate-800 px-3 py-2.5 text-left text-xs font-semibold uppercase dark:bg-slate-950">Pago</th>
                  </tr>
                </thead>
                <tbody>
                  {bloques.map((bloque, filaIdx) => {
                    const esMedia = bloque % 1 !== 0
                    const completoInfo = grilla.completo[filaIdx]
                    // Fondo parejo en vez del rayado sutil por media hora de
                    // antes -- ahora cada hora en punto (menos la primera,
                    // pegada al encabezado) marca una linea divisoria, como
                    // una grilla de calendario real en vez de una tabla lisa.
                    const filaClase = `bg-white dark:bg-slate-900 ${
                      !esMedia && filaIdx !== 0 ? 'border-t border-slate-200 dark:border-slate-700' : ''
                    }`
                    const horaClase = esMedia ? 'text-xs text-slate-400 dark:text-slate-500' : 'text-sm text-slate-500 dark:text-slate-400'

                    if (completoInfo.tipo === 'cubierto') {
                      return (
                        <tr key={bloque} className={filaClase}>
                          <td className={`px-4 py-1.5 align-top ${horaClase}`}>{horaTexto(bloque)}</td>
                        </tr>
                      )
                    }

                    return (
                      <tr key={bloque} className={filaClase}>
                        <td className={`px-4 py-1.5 align-top ${horaClase}`}>{horaTexto(bloque)}</td>
                        {completoInfo.tipo === 'inicio' ? (
                          <>
                            <td colSpan={canchas.length * 2 + 1} rowSpan={completoInfo.rowSpan} className="px-2 py-1.5 align-top">
                              {/* min-height (no porcentual) en vez de h-full: un <td>
                                  con rowSpan no le pasa su altura real (la de las N
                                  filas que abarca) a un hijo con height:100% -- es
                                  una limitacion conocida del layout de tablas. */}
                              <button
                                onClick={() => abrirEditar(completoInfo.reserva, 'Campo completo')}
                                title={completoInfo.reserva.cliente_nombre}
                                className="flex h-full w-full min-w-0 flex-col items-start justify-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-left dark:border-rose-500/30 dark:bg-rose-500/10"
                                style={{ ...estiloAcademia(completoInfo.reserva, oscuro), minHeight: `${completoInfo.rowSpan * 2.5}rem` }}
                              >
                                <ContenidoReserva
                                  reserva={completoInfo.reserva}
                                  extra={<Badge className="shrink-0">Campo completo</Badge>}
                                />
                              </button>
                            </td>
                            <CeldaEstado reserva={completoInfo.reserva} rowSpan={completoInfo.rowSpan} etiquetaCancha="Campo completo" onAbrir={abrirEditar} />
                          </>
                        ) : (
                          <>
                            {canchas.map((c) => {
                              const info = grilla[c.id][filaIdx]
                              if (info.tipo === 'cubierto') return null
                              if (info.tipo === 'inicio') {
                                return (
                                  <Fragment key={c.id}>
                                    <td rowSpan={info.rowSpan} className="px-2 py-1.5 align-top">
                                      <button
                                        onClick={() => abrirEditar(info.reserva, `Cancha ${c.numero}`)}
                                        title={info.reserva.cliente_nombre}
                                        className="flex h-full w-full min-w-0 flex-col items-start justify-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-left dark:border-rose-500/30 dark:bg-rose-500/10"
                                        style={{ ...estiloAcademia(info.reserva, oscuro), minHeight: `${info.rowSpan * 2.5}rem` }}
                                      >
                                        <ContenidoReserva reserva={info.reserva} />
                                      </button>
                                    </td>
                                    <CeldaEstado reserva={info.reserva} rowSpan={info.rowSpan} etiquetaCancha={`Cancha ${c.numero}`} onAbrir={abrirEditar} />
                                  </Fragment>
                                )
                              }
                              if (info.tipo === 'bloqueada') {
                                return (
                                  <Fragment key={c.id}>
                                    <td className="px-2 py-1">
                                      <div className="px-3 py-1.5 text-slate-300 dark:text-slate-600">-</div>
                                    </td>
                                    <td className="px-2 py-1" />
                                  </Fragment>
                                )
                              }
                              return (
                                <Fragment key={c.id}>
                                  <td className="px-2 py-1">
                                    <button
                                      onClick={() => abrirCrear(bloque, c)}
                                      className="w-full rounded-lg px-3 py-1.5 text-left text-slate-400 transition-colors hover:bg-emerald-50 hover:text-emerald-700 dark:text-slate-600 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-400"
                                    >
                                      Libre
                                    </button>
                                  </td>
                                  <td className="px-2 py-1" />
                                </Fragment>
                              )
                            })}
                            <td className="px-2 py-1">
                              {canchas.some((c) => grilla[c.id][filaIdx].tipo !== 'libre') ? (
                                <div className="px-3 py-1.5 text-slate-300 dark:text-slate-600">-</div>
                              ) : (
                                <button
                                  onClick={() => abrirCrearCompleto(bloque)}
                                  className="w-full truncate rounded-lg px-3 py-1.5 text-left text-slate-400 transition-colors hover:bg-emerald-50 hover:text-emerald-700 dark:text-slate-600 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-400"
                                >
                                  Reservar todo
                                </button>
                              )}
                            </td>
                            <td className="px-2 py-1" />
                          </>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div key={`total-wrap-${fecha}`} style={{ ...ANIMADO, animationDelay: '150ms' }}>
            <TotalDelDia
              key={`total-${fecha}`}
              fecha={fecha}
              reservas={reservas}
              academias={academias}
              version={version}
              onDeudaRegistrada={onDeudaRegistrada}
            />
          </div>
        </div>

        <div key={`comentarios-wrap-${fecha}`} className="w-80 shrink-0" style={{ ...ANIMADO, animationDelay: '100ms' }}>
          <ComentariosDia
            key={`comentarios-${fecha}`}
            fecha={fecha}
            canchas={canchas}
            academias={academias}
            onAdelantoCreado={onAdelantoCreadoEnGrilla}
            onPagoAcademia={onPagoAcademia}
            onCambio={notificarCambio}
          />
        </div>
      </div>

      <ReservaDialogo
        contexto={dialogoContexto}
        academias={academias}
        onCerrar={() => setDialogoContexto(null)}
        onGuardada={onGuardada}
        onCancelada={onCancelada}
      />
    </div>
  )
}
