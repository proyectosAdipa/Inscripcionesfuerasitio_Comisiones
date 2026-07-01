import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

async function checkRolPermitido(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const service = createServiceClient()
  const { data: usuario } = await service
    .from('usuarios')
    .select('rol')
    .eq('id', user.id)
    .single()

  return usuario?.rol === 'cierre' || usuario?.rol === 'admin'
}

export async function POST(req: NextRequest) {
  const permitido = await checkRolPermitido()
  if (!permitido) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const { ids, id_defontana } = await req.json() as { ids: string[]; id_defontana: string }

  if (!Array.isArray(ids) || ids.length === 0 || !id_defontana?.trim()) {
    return NextResponse.json({ error: 'Faltan ids o id_defontana' }, { status: 400 })
  }

  const service = createServiceClient()

  const { error } = await service
    .from('programas')
    .update({ id_defontana: id_defontana.trim() })
    .in('id', ids)
    .eq('pais', 'CL')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, actualizados: ids.length })
}
