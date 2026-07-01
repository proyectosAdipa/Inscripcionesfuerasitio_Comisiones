import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { Pais } from '@/lib/types'

interface FilaPrograma {
  product_id: string
  product_name: string
  seller_name: string
  pais: string
}

const PAIS_MAP: Record<string, Pais> = {
  chile: 'CL',
  méxico: 'MX',
  mexico: 'MX',
  colombia: 'CO',
}

function normalizarPais(valor: string): Pais | null {
  return PAIS_MAP[valor.trim().toLowerCase()] ?? null
}

const TIPOS_POR_PALABRA_CLAVE: [string, string][] = [
  ['diplomado', 'Diplomado'],
  ['especializacion', 'Especialización'],
  ['sesion magistral', 'Sesión Magistral'],
  ['acreditacion', 'Acreditación'],
  ['congreso', 'Congreso'],
  ['certificacion', 'Certificación'],
  ['masterclass', 'Masterclass'],
]

function quitarTildes(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function detectarTipo(nombrePrograma: string): string {
  const nombreNormalizado = quitarTildes(nombrePrograma).toLowerCase()

  for (const [palabraClave, tipo] of TIPOS_POR_PALABRA_CLAVE) {
    if (nombreNormalizado.includes(palabraClave)) return tipo
  }

  return 'Curso'
}

function checkAuth(req: NextRequest): boolean {
  const auth = req.headers.get('authorization')
  return auth === `Bearer ${process.env.CRON_SECRET}`
}

async function ejecutarSync(filas: FilaPrograma[]) {
  const service = createServiceClient()

  const noEncontrados: { pais: string; seller_name: string; product_id: string }[] = []
  const porPais: Record<Pais, number> = { CL: 0, MX: 0, CO: 0 }
  let insertados = 0
  let actualizados = 0
  let desactivados = 0

  // Agrupar filas por país
  const filasPorPais = new Map<Pais, FilaPrograma[]>()
  for (const fila of filas) {
    const pais = normalizarPais(fila.pais)
    if (!pais) {
      noEncontrados.push({ pais: fila.pais, seller_name: fila.seller_name, product_id: fila.product_id })
      continue
    }
    if (!filasPorPais.has(pais)) filasPorPais.set(pais, [])
    filasPorPais.get(pais)!.push(fila)
  }

  for (const [pais, filasPais] of filasPorPais) {
    porPais[pais] = filasPais.length

    const { data: vendedorasPais } = await service
      .from('vendedoras')
      .select('id, nombre')
      .eq('pais', pais)

    const vendedorasPorNombre = new Map<string, string>(
      (vendedorasPais ?? []).map((v: { id: string; nombre: string }) => [v.nombre.trim().toLowerCase(), v.id])
    )

    const vendedoraIdsVistos = new Set<string>()
    const wpPostIdsPorVendedora = new Map<string, Set<string>>()

    for (const fila of filasPais) {
      const vendedoraId = vendedorasPorNombre.get((fila.seller_name ?? '').trim().toLowerCase())

      if (!vendedoraId) {
        noEncontrados.push({ pais, seller_name: fila.seller_name, product_id: fila.product_id })
        continue
      }

      vendedoraIdsVistos.add(vendedoraId)
      if (!wpPostIdsPorVendedora.has(vendedoraId)) wpPostIdsPorVendedora.set(vendedoraId, new Set())
      wpPostIdsPorVendedora.get(vendedoraId)!.add(String(fila.product_id))

      const { data: existente } = await service
        .from('programas')
        .select('id')
        .eq('wp_post_id', String(fila.product_id))
        .eq('vendedora_id', vendedoraId)
        .maybeSingle()

      const tipo = detectarTipo(fila.product_name)

      if (existente) {
        await service
          .from('programas')
          .update({ nombre: fila.product_name, tipo, pais, activo: true })
          .eq('id', existente.id)
        actualizados++
      } else {
        await service.from('programas').insert({
          wp_post_id: String(fila.product_id),
          nombre: fila.product_name,
          tipo,
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
    total: filas.length,
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

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  try {
    const body = await req.json()
    const filas: FilaPrograma[] = Array.isArray(body) ? body : (body.programas ?? [])

    if (!Array.isArray(filas) || filas.length === 0) {
      return NextResponse.json({ error: 'Body debe ser un array de programas (o { programas: [...] })' }, { status: 400 })
    }

    const detalle = await ejecutarSync(filas)
    return NextResponse.json({ ok: true, detalle })
  } catch (err: unknown) {
    const mensaje = err instanceof Error ? err.message : 'Error desconocido'
    const service = createServiceClient()
    await service.from('sync_log').insert({ flujo: 'programas', resultado: 'error', detalle: { error: mensaje } })
    return NextResponse.json({ ok: false, error: mensaje }, { status: 500 })
  }
}
