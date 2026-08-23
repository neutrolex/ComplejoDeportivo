import { AlertTriangle } from 'lucide-react'
import { Button } from './ui/button'
import { Dialog, DialogContent } from './ui/dialog'

export default function ConfirmDialogo({ abierto, titulo, detalle, onConfirmar, onCancelar, confirmando }) {
  return (
    <Dialog open={abierto} onOpenChange={(sigueAbierto) => !sigueAbierto && onCancelar()}>
      <DialogContent className="max-w-xs text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-100">
          <AlertTriangle className="h-6 w-6 text-rose-600" />
        </div>
        <h2 className="text-base font-semibold text-slate-900">{titulo || '¿Estás seguro?'}</h2>
        {detalle && <p className="text-sm text-slate-500">{detalle}</p>}

        <div className="mt-1 flex justify-center gap-2">
          <Button variant="outline" onClick={onCancelar} type="button">
            Cancelar
          </Button>
          <Button variant="destructive" onClick={onConfirmar} disabled={confirmando} type="button">
            {confirmando ? 'Eliminando...' : 'Eliminar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
