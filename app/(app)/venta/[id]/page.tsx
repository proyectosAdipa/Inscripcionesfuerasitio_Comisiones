'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'

import { Venta, Inscrito, EstadoInscrito } from '@/lib/types'

const BADGE_INSCRITO: Record<EstadoInscrito, { label: string; className: string }> = {
  pendiente: { label: 'Pendiente', className: 'bg-gray-100 text-gray-600' },
  inscrito: { label: 'Inscrito ✓', className: 'bg-green-100 text-green-700' },
  error: { label: 'Error', className: 'bg-red-100 text-red-700' },
}

type VentaConJoins = Venta & {
  programas: { nombre: string } | null
  metodos_pago: { label: string } | null
  inscritos: Inscrito[]
}

export default function VentaDetallePage() {
  const { id } = useParams<{ id: string }>()
  const [venta, setVenta] = useState<VentaConJoins | null>(null)
  const [loading, setLoading] = useState(true)
  const [reintentando, setReintentando] = useState(false)

  async function load() {
    const res = await fetch(`/api/ventas/${id}`)
    const data = await res.json()
    setVenta(data.venta)
    setLoading(false)
  }

  useEffect(() => { load() }, [id])

  async function handleReintentar() {
    setReintentando(true)
    await fetch('/api/inscribir/reintentar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ venta_id: id }),
    })
    await load()
    setReintentando(false)
  }

  if (loading) return <div className="flex items-center justify-center h-64 text-gray-400 text-sm">Cargando…</div>

  if (!venta) return <p className="text-red-600 text-sm">Venta no encontrada.</p>

  const hayErrores = venta.inscritos?.some(i => i.estado_inscripcion === 'error')

  return (
    <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/registro/historial" className="text-sm text-gray-500 hover:text-gray-800">← Historial</Link>
          <h1 className="text-xl font-semibold text-gray-900">Detalle de venta</h1>
        </div>

        {/* Summary card */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Programa</p>
              <p className="font-medium text-gray-900">{venta.programas?.nombre ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Monto</p>
              <p className="font-medium text-gray-900">${venta.monto_total?.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Fecha</p>
              <p className="text-gray-700">{venta.fecha_venta}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Método de pago</p>
              <p className="text-gray-700">{venta.metodos_pago?.label ?? '—'}</p>
            </div>
            {venta.cupon && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">Cupón</p>
                <p className="text-gray-700">{venta.cupon}</p>
              </div>
            )}
            {venta.numero_pedido && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">N° Pedido</p>
                <p className="text-gray-700">{venta.numero_pedido}</p>
              </div>
            )}
            {venta.numero_boleta && (
              <div>
                <p className="text-xs text-gray-500 mb-0.5">N° Boleta</p>
                <p className="text-gray-700">{venta.numero_boleta}</p>
              </div>
            )}
          </div>

          {venta.comprobante_url && (
            <a
              href={venta.comprobante_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-xs text-violet-600 hover:underline"
            >
              Ver comprobante PDF
            </a>
          )}
        </div>

        {/* Inscritos */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900">Personas inscritas</h2>
            {hayErrores && (
              <button
                onClick={handleReintentar}
                disabled={reintentando}
                className="text-xs bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-lg font-medium transition disabled:opacity-50"
              >
                {reintentando ? 'Reintentando…' : 'Reintentar fallidos'}
              </button>
            )}
          </div>

          <div className="space-y-3">
            {venta.inscritos?.map(ins => {
              const badge = BADGE_INSCRITO[ins.estado_inscripcion]
              return (
                <div key={ins.id} className="flex items-start justify-between py-2 border-b border-gray-100 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{ins.nombre} {ins.apellido}</p>
                    <p className="text-xs text-gray-500">{ins.correo} · {ins.identificador_fiscal}</p>
                    {ins.numero_pedido && (
                      <p className="text-xs text-gray-400 mt-0.5">Pedido: {ins.numero_pedido}</p>
                    )}
                    {ins.estado_inscripcion === 'error' && ins.mensaje_error && (
                      <p className="text-xs text-red-500 mt-0.5">{ins.mensaje_error}</p>
                    )}
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badge.className} whitespace-nowrap`}>
                    {badge.label}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    
  )
}
