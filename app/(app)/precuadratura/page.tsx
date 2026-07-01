'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface VendedoraResumen {
  vendedora_id: string
  nombre: string
  pais: string
  monto_app: number
  cantidad_ventas: number
  cantidad_canceladas: number
  monto_panel: number
  cantidad_panel: number
  delta: number
  estado: 'Cuadra' | 'Descuadra'
  aviso_integridad: string | null
}

interface PorPais {
  total_app: number
  total_panel: number
  vendedoras: VendedoraResumen[]
}

interface PrecuadraturaResponse {
  mes: string
  por_pais: Record<string, PorPais>
  sac: { monto_app: number; cantidad_ventas: number; cantidad_canceladas: number }
}

function mesActualDefault(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function PrecuadraturaPage() {
  const [rol, setRol] = useState<string | null>(null)
  const [loadingRol, setLoadingRol] = useState(true)
  const [mes, setMes] = useState(mesActualDefault())
  const [data, setData] = useState<PrecuadraturaResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/me/vendedora')
      .then(r => r.json())
      .then(d => { setRol(d.rol ?? null); setLoadingRol(false) })
  }, [])

  useEffect(() => {
    setLoading(true)
    setError('')
    fetch(`/api/precuadratura?mes=${mes}`)
      .then(async r => {
        const d = await r.json()
        if (!r.ok) throw new Error(d.error ?? 'Error al cargar')
        setData(d)
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Error desconocido'))
      .finally(() => setLoading(false))
  }, [mes])

  if (loadingRol) {
    return <div className="flex items-center justify-center h-64 text-gray-400 text-sm">Cargando…</div>
  }

  if (rol !== 'cierre' && rol !== 'admin') {
    return <p className="text-red-600 text-sm">No tienes permiso para ver esta sección.</p>
  }

  const paises = data ? Object.keys(data.por_pais).sort() : []

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Precuadratura</h1>
        <input
          type="month"
          value={mes}
          onChange={e => setMes(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
        />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400">Cargando…</p>
      ) : !data || paises.length === 0 ? (
        <p className="text-sm text-gray-400">No hay datos para {mes}.</p>
      ) : (
        <div className="space-y-6">
          {paises.map(pais => {
            const grupo = data.por_pais[pais]
            const deltaPais = grupo.total_app - grupo.total_panel
            return (
              <div key={pais} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="bg-gray-50 px-5 py-3 flex items-center justify-between border-b border-gray-200">
                  <h2 className="text-sm font-semibold text-gray-900">{pais}</h2>
                  <div className="flex gap-4 text-xs text-gray-600">
                    <span>App: <strong className="text-gray-900">${grupo.total_app.toLocaleString()}</strong></span>
                    <span>Panel: <strong className="text-gray-900">${grupo.total_panel.toLocaleString()}</strong></span>
                    <span className={deltaPais === 0 ? 'text-green-600' : 'text-red-600'}>
                      Δ ${deltaPais.toLocaleString()}
                    </span>
                  </div>
                </div>

                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-500 text-xs">
                      <th className="text-left px-5 py-2 font-medium">Vendedora</th>
                      <th className="text-right px-3 py-2 font-medium">Monto App</th>
                      <th className="text-right px-3 py-2 font-medium">Monto Panel</th>
                      <th className="text-right px-3 py-2 font-medium">Δ</th>
                      <th className="text-right px-3 py-2 font-medium">Ventas</th>
                      <th className="text-right px-3 py-2 font-medium">Canceladas</th>
                      <th className="text-left px-3 py-2 font-medium">Estado</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {grupo.vendedoras.map(v => (
                      <tr key={v.vendedora_id} className="border-t border-gray-100 hover:bg-gray-50 transition">
                        <td className="px-5 py-2.5">
                          <p className="text-gray-900">{v.nombre}</p>
                          {v.aviso_integridad && (
                            <p className="text-xs text-amber-600 mt-0.5">⚠ {v.aviso_integridad}</p>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right text-gray-700">${v.monto_app.toLocaleString()}</td>
                        <td className="px-3 py-2.5 text-right text-gray-700">${v.monto_panel.toLocaleString()}</td>
                        <td className={`px-3 py-2.5 text-right ${v.delta === 0 ? 'text-gray-500' : 'text-red-600'}`}>
                          ${v.delta.toLocaleString()}
                        </td>
                        <td className="px-3 py-2.5 text-right text-gray-500">{v.cantidad_ventas}</td>
                        <td className="px-3 py-2.5 text-right text-gray-500">{v.cantidad_canceladas}</td>
                        <td className="px-3 py-2.5">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            v.estado === 'Cuadra' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                          }`}>
                            {v.estado}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <Link
                            href={`/precuadratura/${v.vendedora_id}?mes=${mes}`}
                            className="text-violet-600 hover:text-violet-800 text-xs font-medium"
                          >
                            Ver →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          })}

          {/* SAC no atribuidas */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="bg-gray-50 px-5 py-3 flex items-center justify-between border-b border-gray-200">
              <h2 className="text-sm font-semibold text-gray-900">SAC — no atribuidas</h2>
              <Link
                href={`/precuadratura/sac?mes=${mes}`}
                className="text-violet-600 hover:text-violet-800 text-xs font-medium"
              >
                Ver detalle →
              </Link>
            </div>
            <div className="px-5 py-3 flex gap-6 text-sm text-gray-600">
              <span>Monto: <strong className="text-gray-900">${data.sac.monto_app.toLocaleString()}</strong></span>
              <span>Ventas: <strong className="text-gray-900">{data.sac.cantidad_ventas}</strong></span>
              <span>Canceladas: <strong className="text-gray-900">{data.sac.cantidad_canceladas}</strong></span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
