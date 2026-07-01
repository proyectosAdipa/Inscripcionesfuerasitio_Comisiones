import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { normalizarPais } from '@/lib/pais'

interface FilaPanelDetalle {
  numero_orden: string
  vendedora: string
  mes: string
  wp_post_id: string
  programa: string
  monto: number
  num_lotes: number
  categoria: string
  correo_cliente: string
  nombre_cliente: string
  apellido_cliente: string
  telefono?: string // no se persiste, la tabla no tiene esta columna
  voucher: string | null
  ultimo_estado: string
  fecha: string
  pais: string
}

function checkAuth(req: NextRequest): boolean {
  const auth = req.headers.get('authorization')
  return auth === `Bearer ${process.env.CRON_SECRET}`
}

async function ejecutarSync(filas: FilaPanelDetalle[]) {
  const service = createServiceClient()

  let insertados = 0
  let actualizados = 0
  let boletasRellenadas = 0
  let ventasCanceladas = 0
  const noEncontrados: { vendedora: string; pais: string; numero_orden: string }[] = []

  for (const fila of filas) {
    const pais = normalizarPais(fila.pais)
    if (!pais) {
      noEncontrados.push({ vendedora: fila.vendedora, pais: fila.pais, numero_orden: fila.numero_orden })
      continue
    }

    const payload = {
      vendedora: fila.vendedora,
      mes: fila.mes,
      wp_post_id: fila.wp_post_id,
      programa: fila.programa,
      numero_orden: fila.numero_orden,
      monto: fila.monto,
      num_lotes: fila.num_lotes,
      categoria: fila.categoria,
      correo_cliente: fila.correo_cliente,
      nombre_cliente: fila.nombre_cliente,
      apellido_cliente: fila.apellido_cliente,
      voucher: fila.voucher,
      ultimo_estado: fila.ultimo_estado,
      fecha: fila.fecha,
      pais,
    }

    const { data: existente } = await service
      .from('ventas_panel_detalle')
      .select('id')
      .eq('numero_orden', fila.numero_orden)
      .maybeSingle()

    if (existente) {
      await service.from('ventas_panel_detalle').update(payload).eq('id', existente.id)
      actualizados++
    } else {
      await service.from('ventas_panel_detalle').insert(payload)
      insertados++
    }

    // Efecto secundario 1: rellenar numero_boleta desde voucher
    if (fila.voucher) {
      const { data: ventasBoleta } = await service
        .from('ventas')
        .select('id, numero_boleta')
        .eq('numero_pedido', fila.numero_orden)

      for (const venta of ventasBoleta ?? []) {
        if (venta.numero_boleta !== fila.voucher) {
          await service.from('ventas').update({ numero_boleta: fila.voucher }).eq('id', venta.id)
          boletasRellenadas++
        }
      }
    }

    // Efecto secundario 2: marcar cancelado si el sitio canceló la orden
    if (fila.ultimo_estado === 'wc-cancelled') {
      const { data: ventasACancelar } = await service
        .from('ventas')
        .select('id')
        .eq('numero_pedido', fila.numero_orden)
        .eq('estado_inscripcion', 'inscrito')

      if (ventasACancelar && ventasACancelar.length > 0) {
        await service
          .from('ventas')
          .update({ estado_inscripcion: 'cancelado' })
          .in('id', ventasACancelar.map((v: { id: string }) => v.id))
        ventasCanceladas += ventasACancelar.length
      }
    }
  }

  const detalle = {
    total: filas.length,
    insertados,
    actualizados,
    boletas_rellenadas: boletasRellenadas,
    ventas_canceladas: ventasCanceladas,
    no_encontrados: noEncontrados,
  }

  await service.from('sync_log').insert({ flujo: 'panel_detalle', resultado: 'ok', detalle })

  return detalle
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  try {
    const body = await req.json()
    const filas: FilaPanelDetalle[] = Array.isArray(body) ? body : (body.detalle ?? [])

    if (!Array.isArray(filas) || filas.length === 0) {
      return NextResponse.json({ error: 'Body debe ser un array de detalle (o { detalle: [...] })' }, { status: 400 })
    }

    const detalle = await ejecutarSync(filas)
    return NextResponse.json({ ok: true, detalle })
  } catch (err: unknown) {
    const mensaje = err instanceof Error ? err.message : 'Error desconocido'
    const service = createServiceClient()
    await service.from('sync_log').insert({ flujo: 'panel_detalle', resultado: 'error', detalle: { error: mensaje } })
    return NextResponse.json({ ok: false, error: mensaje }, { status: 500 })
  }
}
