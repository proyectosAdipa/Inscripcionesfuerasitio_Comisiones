'use client'

import { useEffect, useState } from 'react'
import VentasHistorial from '@/components/VentasHistorial'

export default function ReinscripcionesHistorialPage() {
  const [rol, setRol] = useState<string | null>(null)
  const [loadingRol, setLoadingRol] = useState(true)

  useEffect(() => {
    fetch('/api/me/vendedora')
      .then(r => r.json())
      .then(d => { setRol(d.rol ?? null); setLoadingRol(false) })
  }, [])

  if (loadingRol) {
    return <div className="flex items-center justify-center h-64 text-gray-400 text-sm">Cargando…</div>
  }

  if (rol !== 'sac' && rol !== 'admin') {
    return <p className="text-red-600 text-sm">No tienes permiso para ver esta sección.</p>
  }

  return <VentasHistorial titulo="Reinscripciones" nuevoHref="/reinscripciones" nuevoLabel="Nueva reinscripción" />
}
