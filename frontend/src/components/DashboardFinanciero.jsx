import { useEffect, useState } from 'react'
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { Banknote, Calendar, CalendarDays, Clock, Smartphone, TrendingUp } from 'lucide-react'
import { apiFetch } from '../api'
import { useTheme } from '../context/ThemeContext'

const COLOR_YAPE = '#7c3aed'
const COLOR_EFECTIVO = '#059669'

const TARJETAS_PERIODO = [
  { clave: 'hoy', titulo: 'Hoy', icono: Calendar },
  { clave: 'ayer', titulo: 'Ayer', icono: Clock },
  { clave: 'esta_semana', titulo: 'Esta semana', icono: TrendingUp },
  { clave: 'este_mes', titulo: 'Este mes', icono: CalendarDays },
]

function TarjetaPeriodo({ titulo, Icono, monto, reservas }) {
  return (
    <div className="min-w-[170px] flex-1 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm text-slate-500 dark:text-slate-400">{titulo}</span>
        <Icono className="h-4 w-4 text-slate-400 dark:text-slate-500" />
      </div>
      <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">S/{monto}</div>
      <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">{reservas} reservas</div>
    </div>
  )
}

function TarjetaMetodo({ Icono, titulo, monto, color, fondo }) {
  return (
    <div className="flex min-w-[220px] flex-1 items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${fondo}`}>
        <Icono className={`h-5 w-5 ${color}`} />
      </div>
      <div>
        <div className="text-xs text-slate-500 dark:text-slate-400">{titulo}</div>
        <div className={`text-lg font-bold ${color}`}>S/{monto}</div>
      </div>
    </div>
  )
}

export default function DashboardFinanciero() {
  const [datos, setDatos] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let vigente = true
    apiFetch('/reservas/dashboard-financiero/')
      .then((data) => { if (vigente) setDatos(data) })
      .catch((err) => { if (vigente) setError(err.message) })
      .finally(() => { if (vigente) setCargando(false) })
    return () => { vigente = false }
  }, [])

  const { tema } = useTheme()
  const oscuro = tema === 'oscuro'
  const colorEjes = oscuro ? '#64748b' : '#94a3b8'
  const colorGrilla = oscuro ? '#1e293b' : '#e2e8f0'

  if (cargando) return <p className="dark:text-slate-300">Cargando...</p>
  if (error) return <p className="text-red-600 dark:text-red-400">{error}</p>
  if (!datos) return null

  const diarios = datos.ingresos_diarios_30_dias.map((d) => ({
    fecha: `${d.fecha.slice(8, 10)}/${d.fecha.slice(5, 7)}`, Yape: Number(d.yape), Efectivo: Number(d.efectivo),
  }))
  const pieData = [
    { name: 'Yape', value: Number(datos.total_yape_30_dias), fill: COLOR_YAPE },
    { name: 'Efectivo', value: Number(datos.total_efectivo_30_dias), fill: COLOR_EFECTIVO },
  ]
  const porCancha = datos.ingresos_por_cancha_30_dias.map((f) => ({ cancha: f.cancha, monto: Number(f.monto) }))
  const estiloTooltip = {
    fontSize: 12,
    borderRadius: 8,
    border: `1px solid ${oscuro ? '#334155' : '#e2e8f0'}`,
    background: oscuro ? '#0f172a' : 'white',
    color: oscuro ? '#e2e8f0' : '#1e293b',
  }

  return (
    <div>
      <h2 className="mb-5 text-2xl font-bold text-slate-900 dark:text-slate-100">Dashboard financiero</h2>

      <div className="mb-4 flex flex-wrap gap-4">
        {TARJETAS_PERIODO.map((t) => (
          <TarjetaPeriodo
            key={t.clave} titulo={t.titulo} Icono={t.icono}
            monto={datos[t.clave].monto} reservas={datos[t.clave].reservas}
          />
        ))}
      </div>

      <div className="mb-4 flex flex-wrap gap-4">
        <TarjetaMetodo
          Icono={Smartphone} titulo="Total Yape (30 días)" monto={datos.total_yape_30_dias}
          color="text-violet-600 dark:text-violet-400" fondo="bg-violet-100 dark:bg-violet-500/15"
        />
        <TarjetaMetodo
          Icono={Banknote} titulo="Total Efectivo (30 días)" monto={datos.total_efectivo_30_dias}
          color="text-emerald-600 dark:text-emerald-400" fondo="bg-emerald-100 dark:bg-emerald-500/15"
        />
      </div>

      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h3 className="mb-3 font-semibold text-slate-900 dark:text-slate-100">Ingresos diarios (últimos 30 días)</h3>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={diarios}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={colorGrilla} />
            <XAxis dataKey="fecha" fontSize={10} interval={2} stroke={colorEjes} />
            <YAxis fontSize={10} stroke={colorEjes} />
            <Tooltip contentStyle={estiloTooltip} />
            <Legend wrapperStyle={{ color: colorEjes, fontSize: 12 }} />
            <Bar dataKey="Yape" stackId="a" fill={COLOR_YAPE} />
            <Bar dataKey="Efectivo" stackId="a" fill={COLOR_EFECTIVO} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="flex flex-wrap gap-4">
        <div className="min-w-[260px] flex-1 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h3 className="mb-3 font-semibold text-slate-900 dark:text-slate-100">Yape vs Efectivo</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={90}>
                {pieData.map((entrada) => <Cell key={entrada.name} fill={entrada.fill} />)}
              </Pie>
              <Legend wrapperStyle={{ color: colorEjes, fontSize: 12 }} />
              <Tooltip contentStyle={estiloTooltip} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="min-w-[320px] flex-1 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h3 className="mb-3 font-semibold text-slate-900 dark:text-slate-100">Ingresos por cancha (30 días)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={porCancha} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={colorGrilla} />
              <XAxis type="number" fontSize={10} stroke={colorEjes} />
              <YAxis type="category" dataKey="cancha" fontSize={11} width={90} stroke={colorEjes} />
              <Tooltip contentStyle={estiloTooltip} />
              <Bar dataKey="monto" fill="#0891b2" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
