import { useState } from 'react'
import { Calculator } from 'lucide-react'
import { apiFetch } from '../api'
import { Button } from './ui/button'

export default function TotalDelDia({ fecha }) {
  const [totales, setTotales] = useState(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')

  async function calcular() {
    setCargando(true)
    setError('')
    try {
      const data = await apiFetch(`/reservas/resumen-pagos/?fecha=${fecha}`)
      setTotales(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex justify-center">
        <Button onClick={calcular} disabled={cargando} className="gap-2">
          <Calculator className="h-4 w-4" />
          {cargando ? 'Calculando...' : 'Calcular total del día'}
        </Button>
      </div>
      {error && <p className="mt-2 text-center text-sm text-red-600">{error}</p>}
      {totales && (
        <div className="mt-4 rounded-lg bg-gradient-to-br from-slate-800 to-slate-900 p-5 text-white">
          <div className="flex justify-between text-sm text-slate-300">
            <span>Total Yape</span>
            <span className="font-semibold text-white">S/{totales.total_yape}</span>
          </div>
          <div className="mt-2 flex justify-between text-sm text-slate-300">
            <span>Total Efectivo</span>
            <span className="font-semibold text-white">S/{totales.total_efectivo}</span>
          </div>
          <div className="mt-3 flex items-baseline justify-between border-t border-slate-700 pt-3">
            <span className="text-sm font-medium uppercase tracking-wide text-slate-300">Total del día</span>
            <span className="text-2xl font-bold text-emerald-400">S/{totales.total_general}</span>
          </div>
        </div>
      )}
    </div>
  )
}
