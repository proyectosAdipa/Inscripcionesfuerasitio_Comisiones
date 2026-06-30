'use client'

import { Programa, MetodoPago } from '@/lib/types'
import { InscritoData } from './InscritoFields'

interface ProgramaConMonto {
  programa: Programa
  monto: number
}

interface Props {
  programasConMonto: ProgramaConMonto[]
  metodoPago: MetodoPago | null
  cupon: string
  fechaVenta: string
  comprobante: File | null
  inscritos: InscritoData[]
  duplicados: string[]
  onConfirm: () => void
  onCancel: () => void
  loading: boolean
}

export default function ConfirmModal({
  programasConMonto, metodoPago, cupon, fechaVenta, comprobante, inscritos,
  duplicados, onConfirm, onCancel, loading
}: Props) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Confirmar venta</h2>

          {duplicados.length > 0 && (
            <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-sm font-medium text-amber-800 mb-1">Posible duplicado</p>
              {duplicados.map((d, i) => (
                <p key={i} className="text-xs text-amber-700">{d}</p>
              ))}
              <p className="text-xs text-amber-600 mt-1">Puedes continuar si es una reinscripción legítima.</p>
            </div>
          )}

          <div className="space-y-4 text-sm">
            <section>
              <p className="font-medium text-gray-700 mb-2">Programas</p>
              {programasConMonto.map(({ programa, monto }) => (
                <div key={programa.id} className="flex justify-between text-gray-600 py-1 border-b border-gray-100">
                  <span>{programa.nombre}</span>
                  <span className="font-medium">${monto.toLocaleString()}</span>
                </div>
              ))}
            </section>

            <section className="space-y-1 text-gray-600">
              <div className="flex justify-between">
                <span>Método de pago</span>
                <span>{metodoPago?.label ?? '—'}</span>
              </div>
              {cupon && (
                <div className="flex justify-between">
                  <span>Cupón</span>
                  <span>{cupon}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Fecha de venta</span>
                <span>{fechaVenta}</span>
              </div>
              <div className="flex justify-between">
                <span>Comprobante</span>
                <span>{comprobante ? comprobante.name : 'Sin archivo'}</span>
              </div>
            </section>

            <section>
              <p className="font-medium text-gray-700 mb-2">Personas a inscribir ({inscritos.length})</p>
              {inscritos.map((ins, i) => (
                <div key={i} className="py-1.5 border-b border-gray-100 text-gray-600">
                  <p className="font-medium text-gray-800">{ins.nombre} {ins.apellido}</p>
                  <p className="text-xs">{ins.correo} · {ins.identificador_fiscal}</p>
                </div>
              ))}
            </section>
          </div>

          <div className="flex gap-3 mt-6">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="flex-1 border border-gray-300 text-gray-700 text-sm font-medium py-2 rounded-lg hover:bg-gray-50 transition disabled:opacity-50"
            >
              Volver
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={loading}
              className="flex-1 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium py-2 rounded-lg transition disabled:opacity-50"
            >
              {loading ? 'Enviando…' : 'Confirmar y enviar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
