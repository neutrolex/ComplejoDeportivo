import { Clock, Wallet } from 'lucide-react'
import { Badge } from '../../components/ui/badge'
import { rangoTexto } from './horarios'
import { montosDeReserva, montosDeReservaPorTipo } from './pagos'

import { colorTextoAcademia } from './estilosReserva'

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
export function CeldaEstado({ reserva, rowSpan, etiquetaCancha, onAbrir }) {
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

export function ContenidoReserva({ reserva, extra }) {
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
