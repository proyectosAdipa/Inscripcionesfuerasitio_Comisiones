import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const service = createServiceClient()

  const { data: usuario } = await service
    .from('usuarios')
    .select('rol')
    .eq('id', user.id)
    .single()

  let query = service
    .from('ventas')
    .select(`
      id, origen, tipo, monto_total, fecha_venta, mes, estado_inscripcion, creado_en, numero_pedido,
      programas (nombre),
      metodos_pago (label)
    `)
    .order('creado_en', { ascending: false })

  // vendedora only sees their own; sac sees sac origin; admin sees all
  if (usuario?.rol === 'vendedora') {
    query = query.eq('vendedora_id', user.id)
  } else if (usuario?.rol === 'sac') {
    query = query.eq('origen', 'sac').eq('creado_por', user.id)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ventas: data ?? [] })
}
