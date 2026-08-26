import { useEffect, useState } from 'react'
import { Building2, Clock, EyeOff, Pencil, Plus, Trash2 } from 'lucide-react'
import { apiFetch } from '../api'
import { NOMBRES_DIA } from '../utils/fecha'
import AcademiaDialogo from './AcademiaDialogo'
import ConfirmDialogo from './ConfirmDialogo'
import { Button } from './ui/button'

function textoHorario(horario) {
  const dia = NOMBRES_DIA[horario.dia_semana]
  const fin = horario.hora_fin === '00:00:00' ? '00:00' : horario.hora_fin.slice(0, 5)
  return `${dia} · ${horario.hora_inicio.slice(0, 5)}–${fin} · ${horario.canchas.length} cancha(s)`
}

function TarjetaAcademia({ academia, onEditar, onEliminar }) {
  return (
    <div
      className="flex flex-col rounded-xl border border-l-4 border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
      style={{ borderLeftColor: academia.color }}
    >
      <div className="flex flex-1 items-start gap-3 p-4">
        <div
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: academia.color }}
        >
          <Building2 className="h-4 w-4 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-semibold text-slate-900 dark:text-slate-100">{academia.nombre}</span>
            {!academia.permiso_mostrar && (
              <span title="No se muestra en la web pública">
                <EyeOff className="h-3.5 w-3.5 shrink-0 text-slate-300 dark:text-slate-600" />
              </span>
            )}
          </div>

          {academia.horarios.length === 0 ? (
            <p className="mt-1 text-sm text-slate-400 dark:text-slate-500">Sin horarios todavía.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1">
              {academia.horarios.map((h) => (
                <li key={h.id} className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
                  <Clock className="h-3 w-3 shrink-0 text-slate-300 dark:text-slate-600" />
                  {textoHorario(h)}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-1.5 border-t border-slate-100 px-3 py-2 dark:border-slate-800">
        <Button variant="ghost" size="icon" onClick={() => onEditar(academia)} aria-label="Editar academia">
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost" size="icon" onClick={() => onEliminar(academia)} aria-label="Eliminar academia"
          className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-500/10 dark:hover:text-red-400"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

export default function Academias() {
  const [academias, setAcademias] = useState([])
  const [canchas, setCanchas] = useState([])
  const [cargando, setCargando] = useState(true)
  const [dialogoAbierto, setDialogoAbierto] = useState(false)
  const [academiaEditando, setAcademiaEditando] = useState(null)
  const [academiaAEliminar, setAcademiaAEliminar] = useState(null)
  const [eliminando, setEliminando] = useState(false)

  useEffect(() => {
    Promise.all([apiFetch('/academias/'), apiFetch('/canchas/')])
      .then(([academiasData, canchasData]) => {
        setAcademias(academiasData)
        setCanchas(canchasData)
      })
      .finally(() => setCargando(false))
  }, [])

  function abrirCrear() {
    setAcademiaEditando(null)
    setDialogoAbierto(true)
  }

  function abrirEditar(academia) {
    setAcademiaEditando(academia)
    setDialogoAbierto(true)
  }

  function onGuardada(guardada) {
    setAcademias((anteriores) => {
      const existe = anteriores.some((a) => a.id === guardada.id)
      return existe ? anteriores.map((a) => (a.id === guardada.id ? guardada : a)) : [...anteriores, guardada]
    })
  }

  async function confirmarBorrado() {
    setEliminando(true)
    try {
      await apiFetch(`/academias/${academiaAEliminar.id}/`, { method: 'DELETE' })
      setAcademias((anteriores) => anteriores.filter((a) => a.id !== academiaAEliminar.id))
      setAcademiaAEliminar(null)
    } finally {
      setEliminando(false)
    }
  }

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Academias</h2>
        <Button onClick={abrirCrear}>
          <Plus className="h-4 w-4" /> Agregar academia
        </Button>
      </div>

      {cargando && <p className="dark:text-slate-300">Cargando...</p>}
      {!cargando && academias.length === 0 && (
        <p className="text-sm text-slate-400 dark:text-slate-500">Todavía no hay academias registradas.</p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {academias.map((academia) => (
          <TarjetaAcademia
            key={academia.id}
            academia={academia}
            onEditar={abrirEditar}
            onEliminar={setAcademiaAEliminar}
          />
        ))}
      </div>

      <AcademiaDialogo
        abierto={dialogoAbierto}
        academia={academiaEditando}
        canchas={canchas}
        onCerrar={() => setDialogoAbierto(false)}
        onGuardada={onGuardada}
      />

      <ConfirmDialogo
        abierto={academiaAEliminar !== null}
        titulo="¿Eliminar esta academia?"
        detalle={academiaAEliminar?.nombre}
        confirmando={eliminando}
        onConfirmar={confirmarBorrado}
        onCancelar={() => setAcademiaAEliminar(null)}
      />
    </div>
  )
}
