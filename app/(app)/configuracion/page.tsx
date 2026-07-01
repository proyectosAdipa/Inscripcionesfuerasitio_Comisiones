'use client'

import { useEffect, useState } from 'react'

interface ResultadoDefontana {
  origen: string
  total_filas_hoja: number
  programas_actualizados: number
  ambiguos: { id_servicio: string; descripcion: string; candidatos: string[] }[]
  sin_match: { id_servicio: string; descripcion: string }[]
}

export default function ConfiguracionPage() {
  const [rol, setRol] = useState<string | null>(null)
  const [loadingRol, setLoadingRol] = useState(true)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [resultado, setResultado] = useState<ResultadoDefontana | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/me/vendedora')
      .then(r => r.json())
      .then(data => { setRol(data.rol ?? null); setLoadingRol(false) })
  }, [])

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault()
    if (!archivo) return
    setSubiendo(true)
    setError('')
    setResultado(null)

    const fd = new FormData()
    fd.append('file', archivo)

    try {
      const res = await fetch('/api/configuracion/defontana/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al procesar el archivo')
      setResultado(data.detalle)
      setArchivo(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setSubiendo(false)
    }
  }

  if (loadingRol) {
    return <div className="flex items-center justify-center h-64 text-gray-400 text-sm">Cargando…</div>
  }

  if (rol !== 'cierre' && rol !== 'admin') {
    return <p className="text-red-600 text-sm">No tienes permiso para ver esta sección.</p>
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-xl font-semibold text-gray-900">Configuración</h1>

      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Cargar IDs de Defontana (Chile)</h2>
          <p className="text-xs text-gray-500 mt-1">
            Sube el Excel exportado desde la hoja de Defontana (columnas &quot;ID Servicio&quot; y &quot;Descripción&quot;).
            Solo aplica a programas de Chile. Los casos ambiguos o sin match no se modifican automáticamente.
          </p>
        </div>

        <form onSubmit={handleUpload} className="space-y-3">
          <input
            type="file"
            accept=".xlsx"
            onChange={e => setArchivo(e.target.files?.[0] ?? null)}
            className="w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-violet-50 file:text-violet-700 hover:file:bg-violet-100"
          />

          <button
            type="submit"
            disabled={!archivo || subiendo}
            className="bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition disabled:opacity-50"
          >
            {subiendo ? 'Procesando…' : 'Subir y aplicar'}
          </button>
        </form>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {resultado && (
          <div className="space-y-3 pt-2 border-t border-gray-100">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-gray-50 rounded-lg py-3">
                <p className="text-lg font-semibold text-gray-900">{resultado.total_filas_hoja}</p>
                <p className="text-xs text-gray-500">Filas en el archivo</p>
              </div>
              <div className="bg-green-50 rounded-lg py-3">
                <p className="text-lg font-semibold text-green-700">{resultado.programas_actualizados}</p>
                <p className="text-xs text-green-600">Programas actualizados</p>
              </div>
              <div className="bg-amber-50 rounded-lg py-3">
                <p className="text-lg font-semibold text-amber-700">
                  {resultado.ambiguos.length + resultado.sin_match.length}
                </p>
                <p className="text-xs text-amber-600">Pendientes de revisión</p>
              </div>
            </div>

            {resultado.ambiguos.length > 0 && (
              <div>
                <p className="text-xs font-medium text-amber-700 mb-1.5">Ambiguos (más de un programa posible)</p>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {resultado.ambiguos.map((a, i) => (
                    <div key={i} className="bg-amber-50 rounded-lg px-3 py-2 text-xs">
                      <p className="font-medium text-gray-800">{a.id_servicio} — {a.descripcion}</p>
                      <p className="text-gray-500 mt-0.5">Candidatos: {a.candidatos.join(' · ')}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {resultado.sin_match.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-600 mb-1.5">Sin match</p>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {resultado.sin_match.map((s, i) => (
                    <div key={i} className="bg-gray-50 rounded-lg px-3 py-2 text-xs text-gray-700">
                      {s.id_servicio} — {s.descripcion}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
