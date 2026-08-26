import { useEffect, useState } from 'react'
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react'
import { formatearFecha, parsearFecha } from '../utils/fecha'
import { Button } from './ui/button'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'

const NOMBRES_DIA_CORTO = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa', 'Do']
const NOMBRES_MES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto',
  'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

function inicioDeSemana(fecha) {
  const dia = fecha.getDay()
  return dia === 0 ? 6 : dia - 1
}

function generarGrilla(anio, mes) {
  const primerDia = new Date(anio, mes, 1)
  const ultimoDia = new Date(anio, mes + 1, 0)
  const offsetInicio = inicioDeSemana(primerDia)
  const dias = []
  for (let i = 0; i < offsetInicio; i++) dias.push(null)
  for (let d = 1; d <= ultimoDia.getDate(); d++) dias.push(new Date(anio, mes, d))
  while (dias.length % 7 !== 0) dias.push(null)
  return dias
}

export default function CalendarioPopover({ fecha, onSeleccionar }) {
  const [abierto, setAbierto] = useState(false)
  const [mesVisible, setMesVisible] = useState(() => {
    const d = parsearFecha(fecha)
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })

  useEffect(() => {
    if (!abierto) return
    const d = parsearFecha(fecha)
    setMesVisible(new Date(d.getFullYear(), d.getMonth(), 1))
  }, [abierto, fecha])

  const dias = generarGrilla(mesVisible.getFullYear(), mesVisible.getMonth())
  const hoy = formatearFecha(new Date())

  function elegir(dia) {
    onSeleccionar(formatearFecha(dia))
    setAbierto(false)
  }

  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="gap-2">
          <CalendarIcon className="h-4 w-4" />
          {fecha.split('-').reverse().join('/')}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72" align="end">
        <div className="mb-2 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setMesVisible((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {NOMBRES_MES[mesVisible.getMonth()]} {mesVisible.getFullYear()}
          </span>
          <button
            type="button"
            onClick={() => setMesVisible((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-slate-400 dark:text-slate-500">
          {NOMBRES_DIA_CORTO.map((n, i) => <div key={i} className="py-1">{n}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {dias.map((dia, i) => {
            if (!dia) return <div key={i} />
            const texto = formatearFecha(dia)
            const esSeleccionado = texto === fecha
            const esHoy = texto === hoy
            return (
              <button
                key={i}
                type="button"
                onClick={() => elegir(dia)}
                className={`aspect-square rounded-md text-sm transition-colors ${
                  esSeleccionado
                    ? 'bg-emerald-600 font-semibold text-white'
                    : esHoy
                      ? 'font-semibold text-emerald-700 ring-2 ring-inset ring-emerald-500 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-500/10'
                      : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                {dia.getDate()}
              </button>
            )
          })}
        </div>

        <button
          type="button"
          onClick={() => elegir(new Date())}
          className="mt-2 w-full rounded-md border border-slate-200 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Ir a hoy
        </button>
      </PopoverContent>
    </Popover>
  )
}
