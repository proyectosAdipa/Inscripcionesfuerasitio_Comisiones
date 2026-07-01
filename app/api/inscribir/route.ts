import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { ENROLLMENT_URL, Pais, MARCADOR_INSCRIPCION_DESACTIVADA, inscripcionAutomaticaActiva } from '@/lib/types'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const service = createServiceClient()
  const { venta_ids } = await req.json() as { venta_ids: string[] }

  const automatica = inscripcionAutomaticaActiva()
  const results = []

  for (const venta_id of venta_ids) {
    if (!automatica) {
      const { data: inscritosVenta } = await service
        .from('inscritos')
        .select('id, estado_inscripcion')
        .eq('venta_id', venta_id)

      const pendientes = (inscritosVenta ?? []).filter(
        (i: { estado_inscripcion: string }) => i.estado_inscripcion !== 'inscrito'
      )

      if (pendientes.length > 0) {
        await service
          .from('inscritos')
          .update({ estado_inscripcion: 'pendiente', mensaje_error: MARCADOR_INSCRIPCION_DESACTIVADA })
          .in('id', pendientes.map((i: { id: string }) => i.id))
      }

      await service.from('ventas').update({
        estado_inscripcion: 'pendiente',
        mensaje_error: MARCADOR_INSCRIPCION_DESACTIVADA,
      }).eq('id', venta_id)

      results.push({
        venta_id,
        estado: 'pendiente',
        inscripcion_automatica_desactivada: true,
        inscritoResults: pendientes.map((i: { id: string }) => ({ id: i.id, ok: true, pendiente: true })),
      })
      continue
    }
    // Load venta with program, metodo_pago, inscritos and vendedora
    const { data: venta } = await service
      .from('ventas')
      .select(`
        *,
        programas (wp_post_id, pais),
        metodos_pago (codigo, label),
        vendedoras (pais),
        inscritos (*)
      `)
      .eq('id', venta_id)
      .single()

    if (!venta) {
      results.push({ venta_id, error: 'Venta no encontrada' })
      continue
    }

    const pais: Pais = (venta.vendedoras?.pais ?? venta.programas?.pais ?? 'CL') as Pais
    const enrollmentUrl = ENROLLMENT_URL[pais]

    const inscritoResults = []

    for (const inscrito of venta.inscritos ?? []) {
      if (inscrito.estado_inscripcion === 'inscrito') {
        inscritoResults.push({ id: inscrito.id, ok: true, skipped: true })
        continue
      }

      const payload = {
        first_name: inscrito.nombre,
        last_name: inscrito.apellido,
        rut: inscrito.identificador_fiscal,
        phone: inscrito.celular,
        email: inscrito.correo,
        total: venta.monto_total,
        date: venta.fecha_venta,
        tipo: venta.metodos_pago?.codigo ?? '00T',
        metodo_pago_label: venta.metodos_pago?.label ?? 'Transferencia bancaria',
        coupon: venta.cupon ?? null,
        cursos: [venta.programas?.wp_post_id ?? venta.wp_post_id],
        source: 'app_offsite',
      }

      try {
        const wpRes = await fetch(enrollmentUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const wpData = await wpRes.json()

        if (wpData.ok) {
          await service.from('inscritos').update({
            estado_inscripcion: 'inscrito',
            numero_pedido: String(wpData.order_id),
            mensaje_error: null,
          }).eq('id', inscrito.id)

          // Update venta with order_id from first inscrito (or last, for group)
          await service.from('ventas').update({
            numero_pedido: String(wpData.order_id),
          }).eq('id', venta_id)

          inscritoResults.push({ id: inscrito.id, ok: true, order_id: wpData.order_id })
        } else {
          const errMsg = wpData.message ?? 'Error en WordPress'
          await service.from('inscritos').update({
            estado_inscripcion: 'error',
            mensaje_error: errMsg,
          }).eq('id', inscrito.id)
          inscritoResults.push({ id: inscrito.id, ok: false, error: errMsg })
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : 'Error de red'
        await service.from('inscritos').update({
          estado_inscripcion: 'error',
          mensaje_error: errMsg,
        }).eq('id', inscrito.id)
        inscritoResults.push({ id: inscrito.id, ok: false, error: errMsg })
      }
    }

    // Update venta estado based on results
    const allOk = inscritoResults.every(r => r.ok)
    const someOk = inscritoResults.some(r => r.ok)
    const estado = allOk ? 'inscrito' : someOk ? 'parcial' : 'error'
    const primerError = inscritoResults.find(r => !r.ok)?.error ?? null

    await service.from('ventas').update({
      estado_inscripcion: estado,
      mensaje_error: primerError,
    }).eq('id', venta_id)

    results.push({ venta_id, estado, inscritoResults })
  }

  return NextResponse.json({ ok: true, results })
}
