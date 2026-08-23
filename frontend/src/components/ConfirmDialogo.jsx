import { AlertTriangle } from 'lucide-react'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog'

export default function ConfirmDialogo({ abierto, titulo, detalle, onConfirmar, onCancelar, confirmando }) {
  return (
    <Dialog open={abierto} onOpenChange={(sigueAbierto) => !sigueAbierto && onCancelar()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-700">
            <AlertTriangle className="h-4 w-4" /> {titulo}
          </DialogTitle>
        </DialogHeader>

        {detalle && (
          <div className="rounded-lg border-2 border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-800">
            {detalle}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancelar} type="button">
            Cancelar
          </Button>
          <Button variant="destructive" onClick={onConfirmar} disabled={confirmando} type="button">
            {confirmando ? 'Eliminando...' : 'Sí, eliminar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
