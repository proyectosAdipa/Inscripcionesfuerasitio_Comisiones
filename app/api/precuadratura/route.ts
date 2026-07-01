import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { compararMes } from '@/lib/precuadraturaMatch'

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

export async function GET(req: NextRequest) {
  const permitido = await checkRolPermitido()
  if (!permitido) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const mes = searchParams.get('mes')
  if (!mes) return NextResponse.json({ error: 'Falta el parámetro mes (YYYY-MM)' }, { status: 400 })

  const resultado = await compararMes(mes)

  const porPais: Record<string, {
    total_app: number
    total_panel: number
    vendedoras: typeof resultado.porVendedora
  }> = {}

  for (const v of resultado.porVendedora) {
    if (!porPais[v.pais]) porPais[v.pais] = { total_app: 0, total_panel: 0, vendedoras: [] }
    porPais[v.pais].total_app += v.monto_app
    porPais[v.pais].total_panel += v.monto_panel
    porPais[v.pais].vendedoras.push(v)
  }

  for (const pais of Object.keys(porPais)) {
    porPais[pais].vendedoras.sort((a, b) => a.nombre.localeCompare(b.nombre))
  }

  return NextResponse.json({
    mes,
    por_pais: porPais,
    sac: resultado.sac,
  })
}
