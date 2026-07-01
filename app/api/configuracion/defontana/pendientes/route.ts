import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { normalizar } from '@/lib/defontanaMatch'

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

export async function GET() {
  const permitido = await checkRolPermitido()
  if (!permitido) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const service = createServiceClient()

  const { data: pendientes } = await service
    .from('programas')
    .select('id, nombre, wp_post_id')
    .eq('pais', 'CL')
    .eq('activo', true)
    .is('id_defontana', null)
    .order('nombre')

  // Agrupar por nombre normalizado, para que el frontend muestre un solo ítem
  // por curso aunque existan varias filas (vendedoras) con el mismo nombre.
  interface ProgramaPendiente { id: string; nombre: string; wp_post_id: string }
  const grupos = new Map<string, { nombre: string; ids: string[]; wp_post_ids: string[] }>()

  for (const p of (pendientes ?? []) as ProgramaPendiente[]) {
    const clave = normalizar(p.nombre)
    if (!grupos.has(clave)) grupos.set(clave, { nombre: p.nombre, ids: [], wp_post_ids: [] })
    grupos.get(clave)!.ids.push(p.id)
    grupos.get(clave)!.wp_post_ids.push(p.wp_post_id)
  }

  const resultado = Array.from(grupos.values())

  return NextResponse.json({ pendientes: resultado })
}
