'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

import { Venta, EstadoInscripcion } from '@/lib/types'

const ESTADO_BADGE: Record<EstadoInscripcion, { label: string; className: string }> = {
  pendiente: { label: 'Pendiente', className: 'bg-gray-100 text-gray-600' },
  inscrito: { label: 'Inscrito', className: 'bg-green-100 text-green-700' },
  parcial: { label: 'Parcial', className: 'bg-amber-100 text-amber-700' },
  error: { label: 'Error', className: 'bg-red-100 text-red-700' },
  cancelado: { label: 'Cancelado', className: 'bg-gray-200 text-gray-500' },
}

type VentaRow = Venta & { programas: { nombre: string } | null; metodos_pago: { label: string } | null }

export default function HistorialPage() {
  const [ventas, setVentas] = useState<VentaRow[]>([])
  const [loading, setLoading] = useState(true)
  const [mesActivo, setMesActivo] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/ventas/mias')
      .then(r => r.json())
      .then(data => {
        const rows: VentaRow[] = data.ventas ?? []
        setVentas(rows)
        if (rows.length > 0) setMesActivo(rows[0].mes)
        setLoading(false)
      })
  }, [])

  const meses = [...new Set(ventas.map(v => v.mes))].sort().reverse()

  const ventasMes = ventas.filter(v => v.mes === mesActivo)

  return (
    <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold text-gray-900">Mis ventas</h1>
          <Link
            href="/registro"
            className="text-sm bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-lg transition"
          >
            + Nueva venta
          </Link>
        </div>

        {loading ? (
          <div className="text-center text-gray-400 text-sm py-16">Cargando…</div>
        ) : ventas.length === 0 ? (
          <div className="text-center text-gray-400 text-sm py-16">
            No hay ventas registradas.{' '}
            <Link href="/registro" className="text-violet-600 hover:underline">Registrar primera venta</Link>
          </div>
        ) : (
          <>
            {/* Month tabs */}
            <div className="flex gap-2 mb-4 flex-wrap">
              {meses.map(mes => (
                <button
                  key={mes}
                  onClick={() => setMesActivo(mes)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                    mesActivo === mes
                      ? 'bg-violet-600 text-white'
                      : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {mes}
                </button>
              ))}
            </div>

            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Programa</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Fecha</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Monto</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Método</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Estado</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {ventasMes.map(venta => {
                    const badge = ESTADO_BADGE[venta.estado_inscripcion] ?? ESTADO_BADGE.pendiente
                    return (
                      <tr key={venta.id} className="border-b border-gray-100 hover:bg-gray-50 transition">
                        <td className="px-4 py-3 text-gray-900">
                          {venta.programas?.nombre ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-500">{venta.fecha_venta}</td>
                        <td className="px-4 py-3 text-right text-gray-900 font-medium">
                          ${venta.monto_total?.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-gray-500">{venta.metodos_pago?.label ?? '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badge.className}`}>
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/venta/${venta.id}`}
                            className="text-violet-600 hover:text-violet-800 text-xs font-medium"
                          >
                            Ver →
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
  )
}
