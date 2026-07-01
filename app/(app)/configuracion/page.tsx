'use client'

import { useEffect, useState } from 'react'

interface Candidato {
  nombre: string
  ids: string[]
}

interface Ambiguo {
  id_servicio: string
  descripcion: string
  candidatos: Candidato[]
}

interface ResultadoDefontana {
  origen: string
  total_filas_hoja: number
  programas_actualizados: number
  ambiguos: Ambiguo[]
  sin_match: { id_servicio: string; descripcion: string }[]
}

interface ProgramaPendiente {
  nombre: string
  ids: string[]
  wp_post_ids: string[]
}

export default function ConfiguracionPage() {
  const [rol, setRol] = useState<string | null>(null)
  const [loadingRol, setLoadingRol] = useState(true)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [resultado, setResultado] = useState<ResultadoDefontana | null>(null)
  const [error, setError] = useState('')
  const [resolviendo, setResolviendo] = useState<string | null>(null)

  const [pendientes, setPendientes] = useState<ProgramaPendiente[]>([])
  const [loadingPendientes, setLoadingPendientes] = useState(true)
  const [valores, setValores] = useState<Record<string, string>>({})
  const [guardando, setGuardando] = useState<string | null>(null)

  async function cargarPendientes() {
    setLoadingPendientes(true)
    const res = await fetch('/api/configuracion/defontana/pendientes')
    const data = await res.json()
    setPendientes(data.pendientes ?? [])
    setLoadingPendientes(false)
  }

  useEffect(() => {
    fetch('/api/me/vendedora')
      .then(r => r.json())
      .then(data => { setRol(data.rol ?? null); setLoadingRol(false) })
    cargarPendientes()
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
      await cargarPendientes()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setSubiendo(false)
    }
  }

  async function handleAsignar(grupo: ProgramaPendiente) {
    const valor = (valores[grupo.nombre] ?? '').trim()
    if (!valor) return

    setGuardando(grupo.nombre)
    try {
      const res = await fetch('/api/configuracion/defontana/asignar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: grupo.ids, id_defontana: valor }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Error al guardar')

      // Quitar el grupo de la lista localmente, sin esperar un refetch completo
      setPendientes(prev => prev.filter(p => p.nombre !== grupo.nombre))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setGuardando(null)
    }
  }

  async function handleResolverAmbiguo(ambiguo: Ambiguo, candidato: Candidato) {
    const clave = ambiguo.id_servicio
    setResolviendo(clave)
    try {
      const res = await fetch('/api/configuracion/defontana/asignar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: candidato.ids, id_defontana: ambiguo.id_servicio }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Error al guardar')

      // Quitar este ambiguo de la lista, y refrescar pendientes (el candidato elegido ya no debería aparecer ahí)
      setResultado(prev => prev
        ? { ...prev, ambiguos: prev.ambiguos.filter(a => a.id_servicio !== ambiguo.id_servicio) }
        : prev
      )
      await cargarPendientes()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setResolviendo(null)
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
                <p className="text-xs font-medium text-amber-700 mb-1.5">
                  Ambiguos — elige a cuál programa corresponde
                </p>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {resultado.ambiguos.map((a) => (
                    <div key={a.id_servicio} className="bg-amber-50 rounded-lg px-3 py-2 text-xs space-y-1.5">
                      <p className="font-medium text-gray-800">{a.id_servicio} — {a.descripcion}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {a.candidatos.map(c => (
                          <button
                            key={c.nombre}
                            onClick={() => handleResolverAmbiguo(a, c)}
                            disabled={resolviendo === a.id_servicio}
                            className="bg-white border border-amber-300 hover:bg-amber-100 text-gray-700 px-2 py-1 rounded-md transition disabled:opacity-50 text-left"
                          >
                            {resolviendo === a.id_servicio ? 'Guardando…' : c.nombre}
                          </button>
                        ))}
                      </div>
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

      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Programas de Chile sin ID de Defontana</h2>
          <p className="text-xs text-gray-500 mt-1">
            Al asignar un ID acá se aplica a este curso y a cualquier otra fila de Chile con el mismo nombre
            (mismo curso vendido por otra vendedora). Una vez guardado, desaparece de esta lista.
          </p>
        </div>

        {loadingPendientes ? (
          <p className="text-sm text-gray-400">Cargando…</p>
        ) : pendientes.length === 0 ? (
          <p className="text-sm text-gray-400">No quedan programas de Chile sin ID de Defontana.</p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {pendientes.map(grupo => (
              <div key={grupo.nombre} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 truncate">{grupo.nombre}</p>
                  {grupo.ids.length > 1 && (
                    <p className="text-xs text-gray-400">{grupo.ids.length} vendedoras venden este curso</p>
                  )}
                </div>
                <input
                  type="text"
                  placeholder="ID Defontana"
                  value={valores[grupo.nombre] ?? ''}
                  onChange={e => setValores(prev => ({ ...prev, [grupo.nombre]: e.target.value }))}
                  className="w-32 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
                <button
                  onClick={() => handleAsignar(grupo)}
                  disabled={!(valores[grupo.nombre] ?? '').trim() || guardando === grupo.nombre}
                  className="text-xs bg-violet-600 hover:bg-violet-700 text-white px-3 py-1.5 rounded-lg font-medium transition disabled:opacity-50 whitespace-nowrap"
                >
                  {guardando === grupo.nombre ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
