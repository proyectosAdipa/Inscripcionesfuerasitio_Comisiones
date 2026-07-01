import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { ejecutarSyncDefontana, FilaDefontana } from '@/lib/defontanaMatch'

function checkAuth(req: NextRequest): boolean {
  const auth = req.headers.get('authorization')
  return auth === `Bearer ${process.env.CRON_SECRET}`
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  try {
    const body = await req.json()
    const filas: FilaDefontana[] = Array.isArray(body) ? body : (body.programas ?? [])

    if (!Array.isArray(filas) || filas.length === 0) {
      return NextResponse.json({ error: 'Body debe ser un array de { id_servicio, descripcion } (o { programas: [...] })' }, { status: 400 })
    }

    const detalle = await ejecutarSyncDefontana(filas, 'n8n')
    return NextResponse.json({ ok: true, detalle })
  } catch (err: unknown) {
    const mensaje = err instanceof Error ? err.message : 'Error desconocido'
    const service = createServiceClient()
    await service.from('sync_log').insert({ flujo: 'defontana', resultado: 'error', detalle: { error: mensaje } })
    return NextResponse.json({ ok: false, error: mensaje }, { status: 500 })
  }
}
