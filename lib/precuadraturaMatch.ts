import { createServiceClient } from '@/lib/supabase/server'
import { Pais } from '@/lib/types'

export type ResultadoMatch = 'cuadra' | 'descuadre_monto' | 'solo_en_un_lado' | 'cancelada'

export interface PanelDetalleRef {
  numero_orden: string
  monto: number
  ultimo_estado: string
  voucher: string | null
  programa: string
}

export interface VentaClasificada {
  venta_id: string
  vendedora_id: string | null
  origen: string
  monto_total: number
  fecha_venta: string
  numero_pedido: string | null
  estado_inscripcion: string
  resultado: ResultadoMatch
  panel: PanelDetalleRef | null
}

export interface DesgloseTipo {
  cantidad: number
  monto: number
}

export interface ResumenVendedora {
  vendedora_id: string
  nombre: string
  pais: Pais
  monto_sitio_web: number
  monto_bigquery: number
  cantidad_bigquery: number
  monto_app: number
  cantidad_ventas: number
  cantidad_canceladas: number
  desglose_tipo: { individual: DesgloseTipo; empresa: DesgloseTipo }
  delta: number
  estado: 'Cuadra' | 'Descuadra'
  aviso_integridad: string | null
}

export interface ResultadoComparacion {
  mes: string
  ventasClasificadas: VentaClasificada[]
  porVendedora: ResumenVendedora[]
  sac: {
    monto_app: number
    cantidad_ventas: number
    cantidad_canceladas: number
    ventas: VentaClasificada[]
  }
}

const EPSILON = 0.01

function normalizarNombre(texto: string): string {
  return (texto ?? '').trim().toLowerCase()
}

export async function compararMes(mes: string): Promise<ResultadoComparacion> {
  const service = createServiceClient()

  const [{ data: vendedoras }, { data: ventas }, { data: panelDetalle }, { data: panelResumen }] = await Promise.all([
    service.from('vendedoras').select('id, nombre, pais'),
    service.from('ventas').select('*').eq('mes', mes),
    service.from('ventas_panel_detalle').select('*').eq('mes', mes),
    service.from('ventas_panel').select('*').eq('mes', mes),
  ])

  const ventaIds = (ventas ?? []).map((v: { id: string }) => v.id)
  const { data: inscritos } = ventaIds.length > 0
    ? await service.from('inscritos').select('venta_id, correo').in('venta_id', ventaIds)
    : { data: [] }

  const primerCorreoPorVenta = new Map<string, string>()
  for (const ins of (inscritos ?? []) as { venta_id: string; correo: string }[]) {
    if (!primerCorreoPorVenta.has(ins.venta_id)) primerCorreoPorVenta.set(ins.venta_id, ins.correo)
  }

  interface VendedoraRow { id: string; nombre: string; pais: Pais }
  const vendedorasPorId = new Map<string, VendedoraRow>(
    (vendedoras ?? []).map((v: VendedoraRow) => [v.id, v])
  )
  const vendedorasPorNombreNormalizado = new Map<string, VendedoraRow>(
    (vendedoras ?? []).map((v: VendedoraRow) => [normalizarNombre(v.nombre), v])
  )

  interface PanelDetalleRow {
    numero_orden: string
    wp_post_id: string
    monto: number
    ultimo_estado: string
    voucher: string | null
    programa: string
    correo_cliente: string
    vendedora: string
    categoria: string
  }

  const panelPorNumeroOrden = new Map<string, PanelDetalleRow>()
  const panelPorCorreoMontoWp = new Map<string, PanelDetalleRow>()
  for (const p of (panelDetalle ?? []) as PanelDetalleRow[]) {
    panelPorNumeroOrden.set(p.numero_orden, p)
    const clave = `${normalizarNombre(p.correo_cliente)}|${p.monto}|${p.wp_post_id}`
    panelPorCorreoMontoWp.set(clave, p)
  }

  function aRef(p: PanelDetalleRow): PanelDetalleRef {
    return { numero_orden: p.numero_orden, monto: p.monto, ultimo_estado: p.ultimo_estado, voucher: p.voucher, programa: p.programa }
  }

  interface VentaRow {
    id: string
    vendedora_id: string | null
    origen: string
    monto_total: number
    fecha_venta: string
    numero_pedido: string | null
    wp_post_id: string
    estado_inscripcion: string
  }

  const ventasClasificadas: VentaClasificada[] = []

  for (const venta of (ventas ?? []) as VentaRow[]) {
    let panelRow: PanelDetalleRow | undefined

    if (venta.numero_pedido) {
      panelRow = panelPorNumeroOrden.get(venta.numero_pedido)
    } else {
      const correo = primerCorreoPorVenta.get(venta.id)
      if (correo) {
        const clave = `${normalizarNombre(correo)}|${venta.monto_total}|${venta.wp_post_id}`
        panelRow = panelPorCorreoMontoWp.get(clave)
      }
    }

    let resultado: ResultadoMatch
    if (!panelRow) {
      resultado = 'solo_en_un_lado'
    } else if (venta.estado_inscripcion === 'cancelado' || panelRow.ultimo_estado === 'wc-cancelled') {
      resultado = 'cancelada'
    } else if (Math.abs(panelRow.monto - venta.monto_total) < EPSILON) {
      resultado = 'cuadra'
    } else {
      resultado = 'descuadre_monto'
    }

    ventasClasificadas.push({
      venta_id: venta.id,
      vendedora_id: venta.vendedora_id,
      origen: venta.origen,
      monto_total: venta.monto_total,
      fecha_venta: venta.fecha_venta,
      numero_pedido: venta.numero_pedido,
      estado_inscripcion: venta.estado_inscripcion,
      resultado,
      panel: panelRow ? aRef(panelRow) : null,
    })
  }

  // Columna 2 (Fuera de Sitio — BigQuery): suma del detalle (sw_auto + sw_no_auto) en wc-completed, por vendedora
  const sumaDetallePorVendedora = new Map<string, number>()
  const cantidadDetallePorVendedora = new Map<string, number>()
  for (const p of (panelDetalle ?? []) as PanelDetalleRow[]) {
    if (p.ultimo_estado !== 'wc-completed') continue
    if (p.categoria !== 'sw_auto' && p.categoria !== 'sw_no_auto') continue
    const clave = normalizarNombre(p.vendedora)
    sumaDetallePorVendedora.set(clave, (sumaDetallePorVendedora.get(clave) ?? 0) + p.monto)
    cantidadDetallePorVendedora.set(clave, (cantidadDetallePorVendedora.get(clave) ?? 0) + 1)
  }

  interface PanelResumenRow {
    vendedora: string
    sw_monto: number
    sw_auto_monto: number
    sw_no_auto_monto: number
  }

  // Validación de integridad interna del sync (resumen vs. detalle) — NO es el descuadre de la vendedora
  const avisoIntegridadPorVendedora = new Map<string, string>()
  const swMontoPorVendedora = new Map<string, number>()
  for (const r of (panelResumen ?? []) as PanelResumenRow[]) {
    const clave = normalizarNombre(r.vendedora)
    swMontoPorVendedora.set(clave, (swMontoPorVendedora.get(clave) ?? 0) + (r.sw_monto ?? 0))

    const totalResumen = (r.sw_auto_monto ?? 0) + (r.sw_no_auto_monto ?? 0)
    const totalDetalle = sumaDetallePorVendedora.get(clave) ?? 0
    const diferencia = totalResumen - totalDetalle
    if (Math.abs(diferencia) >= 1) {
      avisoIntegridadPorVendedora.set(
        clave,
        `Panel resumen y detalle no coinciden: diferencia $${diferencia.toLocaleString()}`
      )
    }
  }

  // Columna 3 (Fuera de Sitio — App): agrupación por vendedora (excluye origen sac), con desglose por tipo
  interface VentaRowConTipo extends VentaRow { tipo?: string }
  const ventasPorId = new Map<string, VentaRowConTipo>(
    ((ventas ?? []) as VentaRowConTipo[]).map(v => [v.id, v])
  )

  const acumuladorPorVendedora = new Map<string, {
    monto_app: number
    cantidad_ventas: number
    cantidad_canceladas: number
    desglose_tipo: { individual: DesgloseTipo; empresa: DesgloseTipo }
  }>()

  for (const vc of ventasClasificadas) {
    if (vc.origen === 'sac' || !vc.vendedora_id) continue
    if (!acumuladorPorVendedora.has(vc.vendedora_id)) {
      acumuladorPorVendedora.set(vc.vendedora_id, {
        monto_app: 0,
        cantidad_ventas: 0,
        cantidad_canceladas: 0,
        desglose_tipo: { individual: { cantidad: 0, monto: 0 }, empresa: { cantidad: 0, monto: 0 } },
      })
    }
    const acc = acumuladorPorVendedora.get(vc.vendedora_id)!
    if (vc.resultado === 'cancelada') {
      acc.cantidad_canceladas++
    } else {
      acc.monto_app += vc.monto_total
      acc.cantidad_ventas++

      const tipo = ventasPorId.get(vc.venta_id)?.tipo
      const bucket = tipo === 'empresa' ? acc.desglose_tipo.empresa : acc.desglose_tipo.individual
      bucket.cantidad++
      bucket.monto += vc.monto_total
    }
  }

  const porVendedora: ResumenVendedora[] = []
  for (const [vendedoraId, acc] of acumuladorPorVendedora) {
    const vendedora = vendedorasPorId.get(vendedoraId)
    if (!vendedora) continue

    const claveNombre = normalizarNombre(vendedora.nombre)
    const montoBigquery = sumaDetallePorVendedora.get(claveNombre) ?? 0
    const cantidadBigquery = cantidadDetallePorVendedora.get(claveNombre) ?? 0
    const montoSitioWeb = swMontoPorVendedora.get(claveNombre) ?? 0
    const delta = montoBigquery - acc.monto_app

    porVendedora.push({
      vendedora_id: vendedoraId,
      nombre: vendedora.nombre,
      pais: vendedora.pais,
      monto_sitio_web: montoSitioWeb,
      monto_bigquery: montoBigquery,
      cantidad_bigquery: cantidadBigquery,
      monto_app: acc.monto_app,
      cantidad_ventas: acc.cantidad_ventas,
      cantidad_canceladas: acc.cantidad_canceladas,
      desglose_tipo: acc.desglose_tipo,
      delta,
      estado: Math.abs(delta) < EPSILON ? 'Cuadra' : 'Descuadra',
      aviso_integridad: avisoIntegridadPorVendedora.get(claveNombre) ?? null,
    })
  }

  // Grupo SAC (no atribuido)
  const ventasSac = ventasClasificadas.filter(vc => vc.origen === 'sac')
  const sac = {
    monto_app: ventasSac.filter(v => v.resultado !== 'cancelada').reduce((acc, v) => acc + v.monto_total, 0),
    cantidad_ventas: ventasSac.filter(v => v.resultado !== 'cancelada').length,
    cantidad_canceladas: ventasSac.filter(v => v.resultado === 'cancelada').length,
    ventas: ventasSac,
  }

  return { mes, ventasClasificadas, porVendedora, sac }
}
