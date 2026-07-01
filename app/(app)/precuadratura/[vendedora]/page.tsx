'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'

interface PanelRef {
  numero_orden: string
  monto: number
  ultimo_estado: string
  voucher: string | null
  programa: string
}

interface VentaClasificada {
  venta_id: string
  vendedora_id: string | null
  origen: string
  monto_total: number
  fecha_venta: string
  numero_pedido: string | null
  estado_inscripcion: string
  resultado: 'cuadra' | 'descuadre_monto' | 'solo_en_un_lado' | 'cancelada'
  panel: PanelRef | null
}

interface DrillDownResponse {
  mes: string
  nombre: string
  pais: string | null
  resumen: {
    monto_app: number
    monto_panel: number
    delta: number
    cantidad_ventas: number
    cantidad_canceladas: number
    estado: string
    aviso_integridad: string | null
  } | null
  ventas: VentaClasificada[]
}

const BADGE: Record<VentaClasificada['resultado'], { label: string; className: string }> = {
  cuadra: { label: 'Cuadra', className: 'bg-green-100 text-green-700' },
  descuadre_monto: { label: 'Descuadre de monto', className: 'bg-amber-100 text-amber-700' },
  solo_en_un_lado: { label: 'Solo en un lado', className: 'bg-red-100 text-red-700' },
  cancelada: { label: 'Cancelada', className: 'bg-gray-200 text-gray-600' },
}

export default function PrecuadraturaVendedoraPage() {
  const params = useParams<{ vendedora: string }>()
  const searchParams = useSearchParams()
  const mes = searchParams.get('mes') ?? ''

  const [rol, setRol] = useState<string | null>(null)
  const [loadingRol, setLoadingRol] = useState(true)
  const [data, setData] = useState<DrillDownResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/me/vendedora')
      .then(r => r.json())
      .then(d => { setRol(d.rol ?? null); setLoadingRol(false) })
  }, [])

  useEffect(() => {
    if (!mes) return
    setLoading(true)
    setError('')
    fetch(`/api/vendedora/${params.vendedora}/ventas?mes=${mes}`)
      .then(async r => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error ?? 'Error al cargar')
        setData(d)
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Error desconocido'))
      .finally(() => setLoading(false))
  }, [params.vendedora, mes])

  if (loadingRol) {
    return <div className="flex items-center justify-center h-64 text-gray-400 text-sm">Cargando…</div>
  }

  if (rol !== 'cierre' && rol !== 'admin') {
    return <p className="text-red-600 text-sm">No tienes permiso para ver esta sección.</p>
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/precuadratura" className="text-sm text-gray-500 hover:text-gray-800">← Precuadratura</Link>
        <h1 className="text-xl font-semibold text-gray-900">{data?.nombre ?? 'Cargando…'}</h1>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400">Cargando…</p>
      ) : data && (
        <>
          {data.resumen && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              {data.resumen.aviso_integridad && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 mb-4">
                  <p className="text-sm text-amber-700">⚠ {data.resumen.aviso_integridad}</p>
                </div>
              )}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                <div>
                  <p className="text-lg font-semibold text-gray-900">${data.resumen.monto_app?.toLocaleString()}</p>
                  <p className="text-xs text-gray-500">Monto App</p>
                </div>
                <div>
                  <p className="text-lg font-semibold text-gray-900">${data.resumen.monto_panel?.toLocaleString()}</p>
                  <p className="text-xs text-gray-500">Monto Panel</p>
                </div>
                <div>
                  <p className={`text-lg font-semibold ${data.resumen.delta === 0 ? 'text-gray-900' : 'text-red-600'}`}>
                    ${data.resumen.delta?.toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-500">Δ</p>
                </div>
                <div>
                  <p className="text-lg font-semibold text-gray-900">{data.resumen.cantidad_canceladas}</p>
                  <p className="text-xs text-gray-500">Canceladas</p>
                </div>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-xs bg-gray-50">
                  <th className="text-left px-4 py-2.5 font-medium">Fecha</th>
                  <th className="text-left px-4 py-2.5 font-medium">N° Pedido</th>
                  <th className="text-right px-4 py-2.5 font-medium">Monto App</th>
                  <th className="text-right px-4 py-2.5 font-medium">Monto Panel</th>
                  <th className="text-left px-4 py-2.5 font-medium">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {data.ventas.map(v => {
                  const badge = BADGE[v.resultado]
                  return (
                    <tr key={v.venta_id} className="border-t border-gray-100">
                      <td className="px-4 py-2.5 text-gray-600">{v.fecha_venta}</td>
                      <td className="px-4 py-2.5 text-gray-600">{v.numero_pedido ?? '—'}</td>
                      <td className="px-4 py-2.5 text-right text-gray-800">${v.monto_total.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-right text-gray-800">
                        {v.panel ? `$${v.panel.monto.toLocaleString()}` : '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badge.className}`}>
                          {badge.label}
                        </span>
                      </td>
                    </tr>
                  )
                })}
                {data.ventas.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-gray-400">Sin ventas en este mes.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
