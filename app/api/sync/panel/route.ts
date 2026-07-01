import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { normalizarPais } from '@/lib/pais'

interface FilaPanel {
  mes: string
  vendedora: string
  pais: string
  ventas_sw_monto: number
  ventas_sw_cantidad: number
  ventas_sw_auto_monto: number
  ventas_sw_auto_cantidad: number
  ventas_sw_no_auto_monto: number
  ventas_sw_no_auto_cantidad: number
}

function checkAuth(req: NextRequest): boolean {
  const auth = req.headers.get('authorization')
  return auth === `Bearer ${process.env.CRON_SECRET}`
}

async function ejecutarSync(filas: FilaPanel[]) {
  const service = createServiceClient()

  let insertados = 0
  let actualizados = 0
  const noEncontrados: { vendedora: string; pais: string; mes: string }[] = []

  for (const fila of filas) {
    const pais = normalizarPais(fila.pais)
    if (!pais) {
      noEncontrados.push({ vendedora: fila.vendedora, pais: fila.pais, mes: fila.mes })
      continue
    }

    const payload = {
      vendedora: fila.vendedora,
      mes: fila.mes,
      pais,
      sw_monto: fila.ventas_sw_monto,
      sw_cantidad: fila.ventas_sw_cantidad,
      sw_auto_monto: fila.ventas_sw_auto_monto,
      sw_auto_cantidad: fila.ventas_sw_auto_cantidad,
      sw_no_auto_monto: fila.ventas_sw_no_auto_monto,
      sw_no_auto_cantidad: fila.ventas_sw_no_auto_cantidad,
      actualizado_en: new Date().toISOString(),
    }

    const { data: existente } = await service
      .from('ventas_panel')
      .select('id')
      .eq('vendedora', fila.vendedora)
      .eq('mes', fila.mes)
      .eq('pais', pais)
      .maybeSingle()

    if (existente) {
      await service.from('ventas_panel').update(payload).eq('id', existente.id)
      actualizados++
    } else {
      await service.from('ventas_panel').insert(payload)
      insertados++
    }
  }

  const detalle = { total: filas.length, insertados, actualizados, no_encontrados: noEncontrados }

  await service.from('sync_log').insert({ flujo: 'panel', resultado: 'ok', detalle })

  return detalle
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  try {
    const body = await req.json()
    const filas: FilaPanel[] = Array.isArray(body) ? body : (body.panel ?? [])

    if (!Array.isArray(filas) || filas.length === 0) {
      return NextResponse.json({ error: 'Body debe ser un array de totales (o { panel: [...] })' }, { status: 400 })
    }

    const detalle = await ejecutarSync(filas)
    return NextResponse.json({ ok: true, detalle })
  } catch (err: unknown) {
    const mensaje = err instanceof Error ? err.message : 'Error desconocido'
    const service = createServiceClient()
    await service.from('sync_log').insert({ flujo: 'panel', resultado: 'error', detalle: { error: mensaje } })
    return NextResponse.json({ ok: false, error: mensaje }, { status: 500 })
  }
}
