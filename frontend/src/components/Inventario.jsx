import { useEffect, useState } from 'react'
import { Package, Pencil, Plus, Trash2 } from 'lucide-react'
import { apiFetch } from '../api'
import ConfirmDialogo from './ConfirmDialogo'
import InventarioDialogo from './InventarioDialogo'
import { Button } from './ui/button'

function TarjetaMaterial({ material, onEditar, onEliminar }) {
  return (
    <div className="flex flex-col rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-1 items-center gap-3 p-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
          <Package className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-slate-900 dark:text-slate-100">{material.nombre}</span>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-2xl font-bold leading-tight text-slate-900 dark:text-slate-100">{material.cantidad}</div>
          <div className="text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-500">unidades</div>
        </div>
      </div>

      <div className="flex justify-end gap-1.5 border-t border-slate-100 px-3 py-2 dark:border-slate-800">
        <Button variant="ghost" size="icon" onClick={() => onEditar(material)} aria-label="Editar material">
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost" size="icon" onClick={() => onEliminar(material)} aria-label="Eliminar material"
          className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-500/10 dark:hover:text-red-400"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

export default function Inventario() {
  const [materiales, setMateriales] = useState([])
  const [cargando, setCargando] = useState(true)
  const [dialogoAbierto, setDialogoAbierto] = useState(false)
  const [materialEditando, setMaterialEditando] = useState(null)
  const [materialAEliminar, setMaterialAEliminar] = useState(null)
  const [eliminando, setEliminando] = useState(false)

  useEffect(() => {
    apiFetch('/inventario/')
      .then(setMateriales)
      .finally(() => setCargando(false))
  }, [])

  function abrirCrear() {
    setMaterialEditando(null)
    setDialogoAbierto(true)
  }

  function abrirEditar(material) {
    setMaterialEditando(material)
    setDialogoAbierto(true)
  }

  function onGuardado(guardado) {
    setMateriales((anteriores) => {
      const existe = anteriores.some((m) => m.id === guardado.id)
      return existe ? anteriores.map((m) => (m.id === guardado.id ? guardado : m)) : [...anteriores, guardado]
    })
  }

  async function confirmarBorrado() {
    setEliminando(true)
    try {
      await apiFetch(`/inventario/${materialAEliminar.id}/`, { method: 'DELETE' })
      setMateriales((anteriores) => anteriores.filter((m) => m.id !== materialAEliminar.id))
      setMaterialAEliminar(null)
    } finally {
      setEliminando(false)
    }
  }

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Inventario</h2>
        <Button onClick={abrirCrear}>
          <Plus className="h-4 w-4" /> Agregar material
        </Button>
      </div>

      {cargando && <p className="dark:text-slate-300">Cargando...</p>}
      {!cargando && materiales.length === 0 && (
        <p className="text-sm text-slate-400 dark:text-slate-500">Todavía no hay materiales registrados.</p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {materiales.map((material) => (
          <TarjetaMaterial
            key={material.id}
            material={material}
            onEditar={abrirEditar}
            onEliminar={setMaterialAEliminar}
          />
        ))}
      </div>

      <InventarioDialogo
        abierto={dialogoAbierto}
        material={materialEditando}
        onCerrar={() => setDialogoAbierto(false)}
        onGuardado={onGuardado}
      />

      <ConfirmDialogo
        abierto={materialAEliminar !== null}
        titulo="¿Eliminar este material?"
        detalle={materialAEliminar?.nombre}
        confirmando={eliminando}
        onConfirmar={confirmarBorrado}
        onCancelar={() => setMaterialAEliminar(null)}
      />
    </div>
  )
}
