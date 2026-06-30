'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import InscritoFields, { InscritoData } from '@/components/InscritoFields'
import ConfirmModal from '@/components/ConfirmModal'
import { createClient } from '@/lib/supabase/client'
import { Programa, MetodoPago, Pais, Vendedora } from '@/lib/types'

interface ProgramaConMonto {
  programa: Programa
  monto: string
}

const emptyInscrito = (): InscritoData => ({
  nombre: '', apellido: '', identificador_fiscal: '', celular: '', correo: '',
})

export default function RegistroPage() {
  const router = useRouter()
  const [vendedora, setVendedora] = useState<Vendedora | null>(null)
  const [programas, setProgramas] = useState<Programa[]>([])
  const [metodosPago, setMetodosPago] = useState<MetodoPago[]>([])

  // form state
  const [tipo, setTipo] = useState<'individual' | 'empresa'>('individual')
  const [seleccionados, setSeleccionados] = useState<ProgramaConMonto[]>([])
  const [metodoPagoId, setMetodoPagoId] = useState('')
  const [cupon, setCupon] = useState('')
  const [comprobante, setComprobante] = useState<File | null>(null)
  const [fechaVenta, setFechaVenta] = useState(new Date().toISOString().slice(0, 10))
  const [inscritos, setInscritos] = useState<InscritoData[]>([emptyInscrito()])

  const [showModal, setShowModal] = useState(false)
  const [duplicados, setDuplicados] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingData, setLoadingData] = useState(true)
  const [resultado, setResultado] = useState<{ ok: boolean; mensaje: string } | null>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const [{ data: progData }, { data: mpData }, { data: vendData }] = await Promise.all([
        supabase.from('programas').select('*').eq('activo', true).order('nombre'),
        supabase.from('metodos_pago').select('*').eq('activo', true).order('label'),
        supabase.from('vendedoras').select('*').eq('activo', true),
      ])

      // Find vendedora matching this user — via usuarios table
      const { data: usuarioData } = await supabase
        .from('usuarios')
        .select('nombre, rol')
        .eq('id', user.id)
        .single()

      setProgramas(progData ?? [])
      setMetodosPago(mpData ?? [])

      // For admin, show all programs. For vendedora, filter by vendedora_id.
      // We need to find the vendedora record linked to this auth user.
      // For now load all vendedoras and match by email if needed.
      if (vendData && vendData.length > 0) {
        // We'll set the first active vendedora for now; the API will use the real one from session
        setVendedora(vendData[0])
      }

      setLoadingData(false)
    }
    load()
  }, [])

  // Properly load vendedora for current user
  useEffect(() => {
    async function loadVendedora() {
      const supabase = createClient()
      const res = await fetch('/api/me/vendedora')
      if (res.ok) {
        const data = await res.json()
        setVendedora(data.vendedora)
        // Filter programs by this vendedora
        if (data.vendedora) {
          const { data: progData } = await supabase
            .from('programas')
            .select('*')
            .eq('vendedora_id', data.vendedora.id)
            .eq('activo', true)
            .order('nombre')
          setProgramas(progData ?? [])
        }
      }
    }
    loadVendedora()
  }, [])

  function addPrograma(programaId: string) {
    const prog = programas.find(p => p.id === programaId)
    if (!prog) return
    if (seleccionados.find(s => s.programa.id === programaId)) return
    setSeleccionados(prev => [...prev, { programa: prog, monto: '' }])
  }

  function removePrograma(programaId: string) {
    setSeleccionados(prev => prev.filter(s => s.programa.id !== programaId))
  }

  function updateMonto(programaId: string, monto: string) {
    setSeleccionados(prev =>
      prev.map(s => s.programa.id === programaId ? { ...s, monto } : s)
    )
  }

  function updateInscrito(index: number, field: keyof InscritoData, value: string) {
    setInscritos(prev => prev.map((ins, i) => i === index ? { ...ins, [field]: value } : ins))
  }

  function removeInscrito(index: number) {
    setInscritos(prev => prev.filter((_, i) => i !== index))
  }

  async function handleSubmitForm(e: React.FormEvent) {
    e.preventDefault()
    if (seleccionados.length === 0) return alert('Selecciona al menos un programa')
    if (!metodoPagoId) return alert('Selecciona el método de pago')

    // Anti-duplicado check
    const mes = fechaVenta.slice(0, 7)
    const correosQuery = inscritos.map(i => i.correo).join(',')
    const res = await fetch(`/api/ventas/check-duplicado?mes=${mes}&correos=${encodeURIComponent(correosQuery)}&programas=${seleccionados.map(s => s.programa.id).join(',')}`)
    const { duplicados: dups } = await res.json()
    setDuplicados(dups ?? [])
    setShowModal(true)
  }

  async function handleConfirm() {
    setLoading(true)
    try {
      let comprobanteUrl: string | null = null

      if (comprobante) {
        const fd = new FormData()
        fd.append('file', comprobante)
        const uploadRes = await fetch('/api/comprobante/subir', { method: 'POST', body: fd })
        const uploadData = await uploadRes.json()
        comprobanteUrl = uploadData.url ?? null
      }

      const payload = {
        tipo,
        seleccionados: seleccionados.map(s => ({
          programa_id: s.programa.id,
          wp_post_id: s.programa.wp_post_id,
          monto: Number(s.monto),
        })),
        metodo_pago_id: metodoPagoId,
        cupon: cupon || null,
        comprobante_url: comprobanteUrl,
        fecha_venta: fechaVenta,
        inscritos,
      }

      const registrarRes = await fetch('/api/ventas/registrar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const registrarData = await registrarRes.json()

      if (!registrarRes.ok) throw new Error(registrarData.error ?? 'Error al registrar')

      // Trigger enrollment
      await fetch('/api/inscribir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venta_ids: registrarData.venta_ids }),
      })

      setShowModal(false)
      setResultado({ ok: true, mensaje: 'Venta registrada e inscripción iniciada.' })
      setTimeout(() => router.push('/registro/historial'), 2000)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error desconocido'
      setResultado({ ok: false, mensaje: msg })
      setShowModal(false)
      setLoading(false)
    }
  }

  const metodoPagoObj = metodosPago.find(m => m.id === metodoPagoId) ?? null

  if (loadingData) {
    return <div className="flex items-center justify-center h-64 text-gray-400 text-sm">Cargando…</div>
  }

  if (resultado) {
    return (
      <div className={`rounded-xl p-6 text-center ${resultado.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
        <p className="text-lg font-medium">{resultado.ok ? '✓ Listo' : 'Error'}</p>
        <p className="text-sm mt-1">{resultado.mensaje}</p>
      </div>
    )
  }

  return (
    <>
      <div className="max-w-2xl mx-auto">
        <h1 className="text-xl font-semibold text-gray-900 mb-6">Nueva venta</h1>

        <form onSubmit={handleSubmitForm} className="space-y-6">
          {/* Tipo de venta */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-sm font-medium text-gray-700 mb-3">Tipo de venta</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setTipo('individual')}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border transition ${
                  tipo === 'individual'
                    ? 'bg-violet-600 text-white border-violet-600'
                    : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                Individual
              </button>
              <div className="relative flex-1" title="Próximamente — en validación con TI">
                <button
                  type="button"
                  disabled
                  className="w-full py-2 rounded-lg text-sm font-medium border border-gray-200 text-gray-400 bg-gray-50 cursor-not-allowed"
                >
                  Empresa
                </button>
                <span className="absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] text-gray-400">
                  Próximamente
                </span>
              </div>
            </div>
          </div>

          {/* Programas */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <p className="text-sm font-medium text-gray-700">Programa(s)</p>

            <select
              onChange={e => { addPrograma(e.target.value); e.target.value = '' }}
              defaultValue=""
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            >
              <option value="" disabled>Seleccionar programa…</option>
              {programas
                .filter(p => !seleccionados.find(s => s.programa.id === p.id))
                .map(p => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
            </select>

            {seleccionados.map(({ programa, monto }) => (
              <div key={programa.id} className="flex items-center gap-3 p-3 bg-violet-50 rounded-lg">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-800">{programa.nombre}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Monto $</span>
                  <input
                    required
                    type="number"
                    min="0"
                    value={monto}
                    onChange={e => updateMonto(programa.id, e.target.value)}
                    className="w-28 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="0"
                  />
                  <button
                    type="button"
                    onClick={() => removePrograma(programa.id)}
                    className="text-red-400 hover:text-red-600 text-xs"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Pago */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            <p className="text-sm font-medium text-gray-700">Pago</p>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Método de pago</label>
              <select
                required
                value={metodoPagoId}
                onChange={e => setMetodoPagoId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
              >
                <option value="">Seleccionar…</option>
                {metodosPago.map(m => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Cupón (opcional)</label>
                <input
                  value={cupon}
                  onChange={e => setCupon(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  placeholder="CODIGO"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Fecha de venta</label>
                <input
                  required
                  type="date"
                  value={fechaVenta}
                  onChange={e => setFechaVenta(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Comprobante (PDF)</label>
              <input
                type="file"
                accept=".pdf"
                onChange={e => setComprobante(e.target.files?.[0] ?? null)}
                className="w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-violet-50 file:text-violet-700 hover:file:bg-violet-100"
              />
            </div>
          </div>

          {/* Inscritos */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
            <p className="text-sm font-medium text-gray-700">Personas a inscribir</p>

            {inscritos.map((ins, i) => (
              <InscritoFields
                key={i}
                index={i}
                pais={vendedora?.pais ?? 'CL'}
                value={ins}
                onChange={updateInscrito}
                onRemove={removeInscrito}
                canRemove={inscritos.length > 1}
              />
            ))}

            <button
              type="button"
              onClick={() => setInscritos(prev => [...prev, emptyInscrito()])}
              className="text-sm text-violet-600 hover:text-violet-800 font-medium transition"
            >
              + Agregar persona
            </button>
          </div>

          <button
            type="submit"
            className="w-full bg-violet-600 hover:bg-violet-700 text-white font-medium py-3 rounded-xl transition"
          >
            Revisar y confirmar
          </button>
        </form>
      </div>

      {showModal && (
        <ConfirmModal
          programasConMonto={seleccionados.map(s => ({
            programa: s.programa,
            monto: Number(s.monto),
          }))}
          metodoPago={metodoPagoObj}
          cupon={cupon}
          fechaVenta={fechaVenta}
          comprobante={comprobante}
          inscritos={inscritos}
          duplicados={duplicados}
          onConfirm={handleConfirm}
          onCancel={() => setShowModal(false)}
          loading={loading}
        />
      )}
    </>
  )
}
