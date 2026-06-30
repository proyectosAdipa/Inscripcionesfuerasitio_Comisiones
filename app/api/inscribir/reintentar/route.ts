import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { ENROLLMENT_URL, Pais } from '@/lib/types'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const service = createServiceClient()
  const { venta_id } = await req.json() as { venta_id: string }

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

  if (!venta) return NextResponse.json({ error: 'Venta no encontrada' }, { status: 404 })

  const pais: Pais = (venta.vendedoras?.pais ?? venta.programas?.pais ?? 'CL') as Pais
  const enrollmentUrl = ENROLLMENT_URL[pais]

  const fallidoS = (venta.inscritos ?? []).filter((i: { estado_inscripcion: string }) => i.estado_inscripcion === 'error')
  const inscritoResults = []

  for (const inscrito of fallidoS) {
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
        inscritoResults.push({ id: inscrito.id, ok: true })
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

  // Recalculate venta estado
  const { data: allInscritos } = await service
    .from('inscritos')
    .select('estado_inscripcion')
    .eq('venta_id', venta_id)

  const allOk = allInscritos?.every((i: { estado_inscripcion: string }) => i.estado_inscripcion === 'inscrito')
  const someOk = allInscritos?.some((i: { estado_inscripcion: string }) => i.estado_inscripcion === 'inscrito')
  const estado = allOk ? 'inscrito' : someOk ? 'parcial' : 'error'

  await service.from('ventas').update({ estado_inscripcion: estado, mensaje_error: null }).eq('id', venta_id)

  return NextResponse.json({ ok: true, inscritoResults })
}
