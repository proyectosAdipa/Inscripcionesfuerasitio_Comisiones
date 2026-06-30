import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { id } = await params
  const service = createServiceClient()

  const { data, error } = await service
    .from('ventas')
    .select(`
      *,
      programas (id, nombre, wp_post_id),
      metodos_pago (id, codigo, label),
      inscritos (*)
    `)
    .eq('id', id)
    .single()

  if (error || !data) return NextResponse.json({ error: 'No encontrada' }, { status: 404 })

  return NextResponse.json({ venta: data })
}
