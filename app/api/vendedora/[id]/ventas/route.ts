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

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permitido = await checkRolPermitido()
  if (!permitido) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const { id } = await params
  const { searchParams } = new URL(req.url)
  const mes = searchParams.get('mes')
  if (!mes) return NextResponse.json({ error: 'Falta el parámetro mes (YYYY-MM)' }, { status: 400 })

  const resultado = await compararMes(mes)

  if (id === 'sac') {
    return NextResponse.json({
      mes,
      nombre: 'SAC — no atribuidas',
      resumen: {
        monto_app: resultado.sac.monto_app,
        cantidad_ventas: resultado.sac.cantidad_ventas,
        cantidad_canceladas: resultado.sac.cantidad_canceladas,
      },
      ventas: resultado.sac.ventas,
    })
  }

  const resumenVendedora = resultado.porVendedora.find(v => v.vendedora_id === id)
  const ventasVendedora = resultado.ventasClasificadas.filter(v => v.vendedora_id === id && v.origen === 'vendedora')

  if (!resumenVendedora && ventasVendedora.length === 0) {
    return NextResponse.json({ error: 'Vendedora sin ventas en ese mes' }, { status: 404 })
  }

  const service = createServiceClient()
  const { data: vendedora } = await service.from('vendedoras').select('nombre, pais').eq('id', id).single()

  return NextResponse.json({
    mes,
    nombre: vendedora?.nombre ?? resumenVendedora?.nombre ?? '',
    pais: vendedora?.pais ?? resumenVendedora?.pais ?? null,
    resumen: resumenVendedora ?? null,
    ventas: ventasVendedora,
  })
}
