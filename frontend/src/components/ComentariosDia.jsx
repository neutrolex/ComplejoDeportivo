import { useEffect, useState } from 'react'
import { MessageSquare, Plus, Trash2, Wallet } from 'lucide-react'
import { apiFetch } from '../api'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import AdelantoDialogo from './AdelantoDialogo'
import AdelantosPendientes from './AdelantosPendientes'
import ComentarioDialogo from './ComentarioDialogo'
import ConfirmDialogo from './ConfirmDialogo'

export default function ComentariosDia({ fecha, canchas, onAdelantoCreado }) {
  const [comentarios, setComentarios] = useState([])
  const [cargando, setCargando] = useState(true)
  const [dialogoAbierto, setDialogoAbierto] = useState(false)
  const [dialogoAdelantoAbierto, setDialogoAdelantoAbierto] = useState(false)
  const [comentarioAEliminar, setComentarioAEliminar] = useState(null)
  const [eliminando, setEliminando] = useState(false)
  const [recargarAdelantos, setRecargarAdelantos] = useState(0)

  useEffect(() => {
    let vigente = true
    setCargando(true)
    apiFetch(`/comentarios-dia/?fecha=${fecha}`)
      .then((data) => { if (vigente) setComentarios(data) })
      .finally(() => { if (vigente) setCargando(false) })
    return () => { vigente = false }
  }, [fecha])

  async function confirmarBorrado() {
    setEliminando(true)
    try {
      await apiFetch(`/comentarios-dia/${comentarioAEliminar.id}/`, { method: 'DELETE' })
      setComentarios((anteriores) => anteriores.filter((c) => c.id !== comentarioAEliminar.id))
      setComentarioAEliminar(null)
    } finally {
      setEliminando(false)
    }
  }

  function alCrearAdelanto(nueva) {
    onAdelantoCreado(nueva)
    setRecargarAdelantos((n) => n + 1)
  }

  return (
    <div className="sticky top-7 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h3 className="mb-3 flex items-center gap-1.5 font-semibold text-slate-900 dark:text-slate-100">
        <MessageSquare className="h-4 w-4" /> Observaciones del día
      </h3>
      <div className="mb-3 flex items-center gap-2">
        <Button size="sm" onClick={() => setDialogoAbierto(true)}>
          <Plus className="h-3.5 w-3.5" /> Agregar
        </Button>
        <Button size="sm" variant="outline" onClick={() => setDialogoAdelantoAbierto(true)}>
          <Wallet className="h-3.5 w-3.5" /> Agregar adelanto
        </Button>
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
                <button
                  onClick={() => setComentarioAEliminar(c)}
                  className="shrink-0 text-slate-300 opacity-0 transition-opacity hover:text-red-600 group-hover:opacity-100 dark:text-slate-600 dark:hover:text-red-400"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="mt-1.5 flex gap-1.5">
                {Number(c.monto_yape) > 0 && <Badge variant="yape">Yape S/{c.monto_yape}</Badge>}
                {Number(c.monto_efectivo) > 0 && <Badge variant="efectivo">Efectivo S/{c.monto_efectivo}</Badge>}
              </div>
            </div>
          )
        })}
      </div>

      <AdelantosPendientes recargar={recargarAdelantos} canchas={canchas} />

      <ComentarioDialogo
        abierto={dialogoAbierto}
        fecha={fecha}
        onCerrar={() => setDialogoAbierto(false)}
        onCreado={(nuevo) => setComentarios((anteriores) => [nuevo, ...anteriores])}
      />

      <AdelantoDialogo
        abierto={dialogoAdelantoAbierto}
        canchas={canchas}
        onCerrar={() => setDialogoAdelantoAbierto(false)}
        onCreado={alCrearAdelanto}
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
