import { NextRequest, NextResponse } from 'next/server'
import { createBigQueryClient } from '@/lib/bigquery'
import { createServiceClient } from '@/lib/supabase/server'
import { Pais } from '@/lib/types'

interface FilaBigQuery {
  Product_id: string
  Product_name: string
  Seller_name: string
}

const TABLAS_POR_PAIS: Record<Pais, string> = {
  CL: 'adipa-cl-331013.chile_ventas_produccion.datos_producto_disponibles_sitio',
  MX: 'adipa-cl-331013.mexico_ventas_produccion.datos_producto_disponibles_sitio',
  CO: 'adipa-cl-331013.colombia_ventas_produccion.datos_producto_disponibles_sitio',
}

function checkAuth(req: NextRequest): boolean {
  const auth = req.headers.get('authorization')
  return auth === `Bearer ${process.env.CRON_SECRET}`
}

async function ejecutarSync() {
  const bigquery = createBigQueryClient()
  const service = createServiceClient()

  const noEncontrados: { pais: Pais; seller_name: string; product_id: string }[] = []
  const porPais: Record<Pais, number> = { CL: 0, MX: 0, CO: 0 }
  let insertados = 0
  let actualizados = 0
  let desactivados = 0

  for (const pais of Object.keys(TABLAS_POR_PAIS) as Pais[]) {
    const tabla = TABLAS_POR_PAIS[pais]

    const [rows] = await bigquery.query({
      query: `SELECT Product_id, Product_name, Seller_name FROM \`${tabla}\``,
    })

    const filas = rows as FilaBigQuery[]
    porPais[pais] = filas.length

    // Cache de vendedoras por (nombre normalizado + pais) para no consultar una por fila
    const { data: vendedorasPais } = await service
      .from('vendedoras')
      .select('id, nombre')
      .eq('pais', pais)

    const vendedorasPorNombre = new Map<string, string>(
      (vendedorasPais ?? []).map((v: { id: string; nombre: string }) => [v.nombre.trim().toLowerCase(), v.id])
    )

    const vendedoraIdsVistos = new Set<string>()
    const wpPostIdsPorVendedora = new Map<string, Set<string>>()

    for (const fila of filas) {
      const vendedoraId = vendedorasPorNombre.get((fila.Seller_name ?? '').trim().toLowerCase())

      if (!vendedoraId) {
        noEncontrados.push({ pais, seller_name: fila.Seller_name, product_id: fila.Product_id })
        continue
      }

      vendedoraIdsVistos.add(vendedoraId)
      if (!wpPostIdsPorVendedora.has(vendedoraId)) wpPostIdsPorVendedora.set(vendedoraId, new Set())
      wpPostIdsPorVendedora.get(vendedoraId)!.add(String(fila.Product_id))

      // Buscar si ya existe (wp_post_id, vendedora_id)
      const { data: existente } = await service
        .from('programas')
        .select('id')
        .eq('wp_post_id', String(fila.Product_id))
        .eq('vendedora_id', vendedoraId)
        .maybeSingle()

      if (existente) {
        await service
          .from('programas')
          .update({ nombre: fila.Product_name, pais, activo: true })
          .eq('id', existente.id)
        actualizados++
      } else {
        await service.from('programas').insert({
          wp_post_id: String(fila.Product_id),
          nombre: fila.Product_name,
          tipo: 'curso',
          vendedora_id: vendedoraId,
          pais,
          activo: true,
        })
        insertados++
      }
    }

    // Desactivar programas de vendedoras vistas que no vinieron en este sync
    for (const vendedoraId of vendedoraIdsVistos) {
      const wpPostIdsActuales = Array.from(wpPostIdsPorVendedora.get(vendedoraId) ?? [])

      const { data: programasVendedora } = await service
        .from('programas')
        .select('id, wp_post_id')
        .eq('vendedora_id', vendedoraId)
        .eq('activo', true)

      const aDesactivar = (programasVendedora ?? []).filter(
        (p: { id: string; wp_post_id: string }) => !wpPostIdsActuales.includes(p.wp_post_id)
      )

      if (aDesactivar.length > 0) {
        await service
          .from('programas')
          .update({ activo: false })
          .in('id', aDesactivar.map((p: { id: string; wp_post_id: string }) => p.id))
        desactivados += aDesactivar.length
      }
    }
  }

  const detalle = {
    total: porPais.CL + porPais.MX + porPais.CO,
    insertados,
    actualizados,
    desactivados,
    no_encontrados: noEncontrados,
    por_pais: porPais,
  }

  await service.from('sync_log').insert({
    flujo: 'programas',
    resultado: 'ok',
    detalle,
  })

  return detalle
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  try {
    const detalle = await ejecutarSync()
    return NextResponse.json({ ok: true, detalle })
  } catch (err: unknown) {
    const mensaje = err instanceof Error ? err.message : 'Error desconocido'
    const service = createServiceClient()
    await service.from('sync_log').insert({ flujo: 'programas', resultado: 'error', detalle: { error: mensaje } })
    return NextResponse.json({ ok: false, error: mensaje }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  return GET(req)
}
