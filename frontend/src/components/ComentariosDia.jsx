import { useEffect, useState } from 'react'
import { Building2, MessageSquare, Pencil, Plus, Trash2, Wallet } from 'lucide-react'
import { apiFetch } from '../api'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import AdelantoDialogo from './AdelantoDialogo'
import ComentarioDialogo from './ComentarioDialogo'
import ConfirmDialogo from './ConfirmDialogo'
import PagoAcademiaDialogo from './PagoAcademiaDialogo'

export default function ComentariosDia({ fecha, canchas, academias, onAdelantoCreado, onPagoAcademia, onCambio }) {
  const [comentarios, setComentarios] = useState([])
  const [cargando, setCargando] = useState(true)
  const [dialogoAbierto, setDialogoAbierto] = useState(false)
  const [comentarioEditando, setComentarioEditando] = useState(null)
  const [dialogoAdelantoAbierto, setDialogoAdelantoAbierto] = useState(false)
  const [dialogoPagoAcademiaAbierto, setDialogoPagoAcademiaAbierto] = useState(false)
  const [pagoAcademiaEditando, setPagoAcademiaEditando] = useState(null)
  const [comentarioAEliminar, setComentarioAEliminar] = useState(null)
  const [eliminando, setEliminando] = useState(false)

  useEffect(() => {
    let vigente = true
    setCargando(true)
    apiFetch(`/comentarios-dia/?fecha=${fecha}`)
      .then((data) => { if (vigente) setComentarios(data) })
      .finally(() => { if (vigente) setCargando(false) })
    return () => { vigente = false }
  }, [fecha])

  // Al crear un adelanto, el backend agrega ademas una nota informativa en
  // el dia en que se registra (no en el dia que se juega, que puede ser
  // otro) -- se recarga esta lista para que aparezca si coincide con el
  // dia que se esta viendo ahora.
  function recargarComentarios() {
    apiFetch(`/comentarios-dia/?fecha=${fecha}`).then(setComentarios).catch(() => {})
  }

  async function confirmarBorrado() {
    setEliminando(true)
    try {
      await apiFetch(`/comentarios-dia/${comentarioAEliminar.id}/`, { method: 'DELETE' })
      setComentarios((anteriores) => anteriores.filter((c) => c.id !== comentarioAEliminar.id))
      setComentarioAEliminar(null)
      onCambio?.()
    } finally {
      setEliminando(false)
    }
  }

  function alCrearAdelanto(nueva) {
    onAdelantoCreado(nueva)
    recargarComentarios()
    onCambio?.()
  }

  function abrirComentario(c) {
    setComentarioEditando(c)
    setDialogoAbierto(true)
  }

  function abrirPagoAcademia(c) {
    setPagoAcademiaEditando(c)
    setDialogoPagoAcademiaAbierto(true)
  }

  function alGuardarComentario(actualizado) {
    setComentarios((anteriores) => {
      const existe = anteriores.some((c) => c.id === actualizado.id)
      return existe ? anteriores.map((c) => (c.id === actualizado.id ? actualizado : c)) : [actualizado, ...anteriores]
    })
    if (actualizado.academia) onPagoAcademia?.(actualizado)
    else onCambio?.()
  }

  return (
    <div className="sticky top-7 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h3 className="mb-3 flex items-center gap-1.5 font-semibold text-slate-900 dark:text-slate-100">
        <MessageSquare className="h-4 w-4" /> Observaciones del día
      </h3>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => abrirComentario(null)}>
          <Plus className="h-3.5 w-3.5" /> Agregar
        </Button>
        <Button size="sm" variant="outline" onClick={() => setDialogoAdelantoAbierto(true)}>
          <Wallet className="h-3.5 w-3.5" /> Agregar adelanto
        </Button>
        {academias?.length > 0 && (
          <Button size="sm" variant="outline" onClick={() => abrirPagoAcademia(null)}>
            <Building2 className="h-3.5 w-3.5" /> Pago de academia
          </Button>
        )}
      </div>

      {cargando && <p className="text-sm text-slate-400 dark:text-slate-500">Cargando...</p>}
      {!cargando && comentarios.length === 0 && (
        <p className="text-sm text-slate-400 dark:text-slate-500">Sin comentarios este día.</p>
      )}

      <div className="flex flex-col gap-2">
        {comentarios.map((c) => {
          const marcadoParaBorrar = comentarioAEliminar?.id === c.id
          return (
            <div
              key={c.id}
              className={`group rounded-lg border-l-4 bg-slate-50 p-3 transition-shadow dark:bg-slate-800/60 ${
                marcadoParaBorrar ? 'border-red-500 ring-2 ring-red-300 dark:ring-red-500/40' : 'border-emerald-500'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm text-slate-700 dark:text-slate-300">{c.texto}</p>
                <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={() => (c.academia ? abrirPagoAcademia(c) : abrirComentario(c))}
                    className="text-slate-300 hover:text-slate-600 dark:text-slate-600 dark:hover:text-slate-300"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setComentarioAEliminar(c)}
                    className="text-slate-300 hover:text-red-600 dark:text-slate-600 dark:hover:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              {c.academia && (
                <p className="mt-1 text-xs font-medium" style={{ color: c.academia.color }}>
                  Pago de deuda — {c.academia.nombre}
                </p>
              )}
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {Number(c.monto_yape) > 0 && <Badge variant="yape">Yape S/{c.monto_yape}</Badge>}
                {Number(c.monto_efectivo) > 0 && <Badge variant="efectivo">Efectivo S/{c.monto_efectivo}</Badge>}
                {c.academia && c.academia_deuda_resultante !== null && (
                  <Badge variant="pendiente">Debe S/{Number(c.academia_deuda_resultante).toFixed(2)}</Badge>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <ComentarioDialogo
        abierto={dialogoAbierto}
        fecha={fecha}
        comentario={comentarioEditando}
        onCerrar={() => setDialogoAbierto(false)}
        onCreado={alGuardarComentario}
        onActualizado={alGuardarComentario}
      />

      <AdelantoDialogo
        abierto={dialogoAdelantoAbierto}
        canchas={canchas}
        onCerrar={() => setDialogoAdelantoAbierto(false)}
        onCreado={alCrearAdelanto}
      />

      <PagoAcademiaDialogo
        abierto={dialogoPagoAcademiaAbierto}
        fecha={fecha}
        academias={academias}
        comentario={pagoAcademiaEditando}
        onCerrar={() => setDialogoPagoAcademiaAbierto(false)}
        onCreado={alGuardarComentario}
        onActualizado={alGuardarComentario}
      />

      <ConfirmDialogo
        abierto={comentarioAEliminar !== null}
        titulo="¿Borrar este comentario?"
        detalle={comentarioAEliminar?.texto}
        confirmando={eliminando}
        onConfirmar={confirmarBorrado}
        onCancelar={() => setComentarioAEliminar(null)}
      />
    </div>
  )
}
