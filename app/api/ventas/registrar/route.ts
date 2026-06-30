import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const service = createServiceClient()

  const { data: usuario } = await service
    .from('usuarios')
    .select('rol')
    .eq('id', user.id)
    .single()

  if (!usuario) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 403 })

  const body = await req.json()
  const { tipo, seleccionados, metodo_pago_id, cupon, comprobante_url, fecha_venta, inscritos } = body

  const mes = (fecha_venta as string).slice(0, 7) // YYYY-MM

  // Find vendedora_id for this user (if role is vendedora)
  let vendedora_id: string | null = null
  if (usuario.rol === 'vendedora') {
    const { data: v } = await service.from('vendedoras').select('id').eq('id', user.id).single()
    vendedora_id = v?.id ?? null
  }

  const origen = usuario.rol === 'sac' ? 'sac' : 'vendedora'

  const venta_ids: string[] = []

  // One venta per program (multi-programa → multiple rows)
  for (const sel of seleccionados) {
    const ventaPayload = {
      origen,
      vendedora_id,
      tipo,
      es_factura: tipo === 'empresa',
      nombre_empresa: null,
      identificador_fiscal_empresa: null,
      programa_id: sel.programa_id,
      wp_post_id: sel.wp_post_id,
      metodo_pago_id,
      monto_total: sel.monto,
      cupon: cupon ?? null,
      comprobante_url: comprobante_url ?? null,
      fecha_venta,
      mes,
      estado_inscripcion: 'pendiente',
      creado_por: user.id,
    }

    const { data: venta, error: ventaError } = await service
      .from('ventas')
      .insert(ventaPayload)
      .select('id')
      .single()

    if (ventaError || !venta) {
      return NextResponse.json({ error: ventaError?.message ?? 'Error al guardar venta' }, { status: 500 })
    }

    // Insert inscritos for this venta
    const inscritosPayload = (inscritos as Array<{
      nombre: string; apellido: string; identificador_fiscal: string; celular: string; correo: string
    }>).map(ins => ({
      venta_id: venta.id,
      nombre: ins.nombre,
      apellido: ins.apellido,
      identificador_fiscal: ins.identificador_fiscal,
      celular: ins.celular,
      correo: ins.correo,
      estado_inscripcion: 'pendiente',
    }))

    const { error: inscritosError } = await service.from('inscritos').insert(inscritosPayload)
    if (inscritosError) {
      return NextResponse.json({ error: inscritosError.message }, { status: 500 })
    }

    venta_ids.push(venta.id)
  }

  return NextResponse.json({ ok: true, venta_ids })
}
