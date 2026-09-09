import { useEffect, useState } from 'react'
import { apiFetch } from '../api'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'
import { Input } from './ui/input'

export default function InventarioDialogo({ abierto, material, onCerrar, onGuardado }) {
  const [nombre, setNombre] = useState('')
  const [cantidad, setCantidad] = useState('0')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const modoEditar = Boolean(material)

  useEffect(() => {
    if (!abierto) return
    setError('')
    setNombre(material?.nombre || '')
    setCantidad(material ? String(material.cantidad) : '0')
  }, [abierto, material])

  async function guardar() {
    if (!nombre.trim()) {
      setError('El nombre es obligatorio.')
      return
    }
    setError('')
    setGuardando(true)
    const body = { nombre, cantidad: Number(cantidad) || 0 }
    try {
      const guardado = modoEditar
        ? await apiFetch(`/inventario/${material.id}/`, { method: 'PATCH', body: JSON.stringify(body) })
        : await apiFetch('/inventario/', { method: 'POST', body: JSON.stringify(body) })
      onGuardado(guardado)
      onCerrar()
    } catch (err) {
      setError(err.message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={(sigueAbierto) => !sigueAbierto && onCerrar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{modoEditar ? 'Editar material' : 'Nuevo material'}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300" htmlFor="inventario-nombre">Nombre</label>
          <Input id="inventario-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Pelotas de futbol" />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300" htmlFor="inventario-cantidad">Cantidad</label>
          <Input
            id="inventario-cantidad" type="number" step="1" min="0" className="max-w-40"
            value={cantidad} onChange={(e) => setCantidad(e.target.value)}
          />
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex justify-end">
          <Button onClick={guardar} disabled={guardando}>Guardar</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
