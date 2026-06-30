import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ duplicados: [] }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const mes = searchParams.get('mes') ?? ''
  const correos = (searchParams.get('correos') ?? '').split(',').filter(Boolean)
  const programas = (searchParams.get('programas') ?? '').split(',').filter(Boolean)

  if (!correos.length || !programas.length) return NextResponse.json({ duplicados: [] })

  const service = createServiceClient()
  const { data: existing } = await service
    .from('inscritos')
    .select('correo, venta_id, ventas!inner(mes, programa_id, programas(nombre))')
    .in('correo', correos)
    .eq('ventas.mes', mes)
    .in('ventas.programa_id', programas)

  const duplicados: string[] = []
  if (existing && existing.length > 0) {
    for (const row of existing) {
      const venta = (row as unknown as { ventas: { programas: { nombre: string } | null } }).ventas
      const nombreProg = venta?.programas?.nombre ?? 'programa'
      duplicados.push(`${row.correo} ya está registrado en ${nombreProg} este mes`)
    }
  }

  return NextResponse.json({ duplicados })
}
