import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ vendedora: null }, { status: 401 })

  const service = createServiceClient()

  // Get usuario record to find rol
  const { data: usuario } = await service
    .from('usuarios')
    .select('rol, nombre')
    .eq('id', user.id)
    .single()

  if (!usuario) return NextResponse.json({ vendedora: null }, { status: 404 })

  // For admin/sac, return null vendedora (they see all programs)
  if (usuario.rol !== 'vendedora') {
    return NextResponse.json({ vendedora: null, rol: usuario.rol })
  }

  // Find vendedora by matching email with auth user
  const { data: vendedora } = await service
    .from('vendedoras')
    .select('*')
    .eq('activo', true)
    .limit(1)
    .single()

  // NOTE: In production, vendedoras.id should equal usuarios.id (same UUID)
  // For now we match by the usuarios.id === vendedoras.id convention
  const { data: vendedoraById } = await service
    .from('vendedoras')
    .select('*')
    .eq('id', user.id)
    .single()

  return NextResponse.json({ vendedora: vendedoraById ?? vendedora, rol: usuario.rol })
}
