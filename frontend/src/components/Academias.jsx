import { useEffect, useState } from 'react'
import { Building2, Pencil, Plus, Trash2 } from 'lucide-react'
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
        <h2 className="text-2xl font-bold text-slate-900">Academias</h2>
        <Button onClick={abrirCrear}>
          <Plus className="h-4 w-4" /> Agregar academia
        </Button>
      </div>

      {cargando && <p>Cargando...</p>}
      {!cargando && academias.length === 0 && (
        <p className="text-sm text-slate-400">Todavía no hay academias registradas.</p>
      )}

      <div className="flex flex-col gap-3">
        {academias.map((academia) => (
          <div key={academia.id} className="flex items-start justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: academia.color }}>
                <Building2 className="h-4 w-4 text-white" />
              </div>
              <div>
                <div className="font-semibold text-slate-900">{academia.nombre}</div>
                {academia.horarios.length === 0 ? (
                  <p className="text-sm text-slate-400">Sin horarios todavía.</p>
                ) : (
                  <ul className="mt-1 flex flex-col gap-0.5 text-sm text-slate-500">
                    {academia.horarios.map((h) => <li key={h.id}>{textoHorario(h)}</li>)}
                  </ul>
                )}
              </div>
            </div>
            <div className="flex shrink-0 gap-1.5">
              <Button variant="outline" size="icon" onClick={() => abrirEditar(academia)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button variant="destructive" size="icon" onClick={() => setAcademiaAEliminar(academia)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
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
