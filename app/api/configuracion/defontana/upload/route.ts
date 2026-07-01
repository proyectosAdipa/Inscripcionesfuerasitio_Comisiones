import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { ejecutarSyncDefontana, FilaDefontana } from '@/lib/defontanaMatch'

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

function extraerFilas(worksheet: ExcelJS.Worksheet): FilaDefontana[] {
  let filaHeaderIdx = -1
  let colIdServicio = -1
  let colDescripcion = -1

  worksheet.eachRow((row, rowNumber) => {
    if (filaHeaderIdx !== -1) return
    row.eachCell((cell, colNumber) => {
      const valor = String(cell.value ?? '').trim().toLowerCase()
      if (valor === 'id servicio') { colIdServicio = colNumber; filaHeaderIdx = rowNumber }
      if (valor === 'descripción' || valor === 'descripcion') colDescripcion = colNumber
    })
  })

  if (filaHeaderIdx === -1 || colIdServicio === -1 || colDescripcion === -1) {
    throw new Error('No se encontraron las columnas "ID Servicio" y "Descripción" en el archivo')
  }

  const filas: FilaDefontana[] = []
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber <= filaHeaderIdx) return
    const idServicio = String(row.getCell(colIdServicio).value ?? '').trim()
    const descripcion = String(row.getCell(colDescripcion).value ?? '').trim()
    if (idServicio && descripcion) filas.push({ id_servicio: idServicio, descripcion })
  })

  return filas
}

export async function POST(req: NextRequest) {
  const permitido = await checkRolPermitido()
  if (!permitido) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'Sin archivo' }, { status: 400 })

    const arrayBuffer = await file.arrayBuffer()
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(arrayBuffer)

    const worksheet = workbook.worksheets[0]
    if (!worksheet) return NextResponse.json({ error: 'El archivo no tiene hojas' }, { status: 400 })

    const filas = extraerFilas(worksheet)
    if (filas.length === 0) {
      return NextResponse.json({ error: 'No se encontraron filas con ID Servicio y Descripción' }, { status: 400 })
    }

    const detalle = await ejecutarSyncDefontana(filas, 'upload_manual')
    return NextResponse.json({ ok: true, detalle })
  } catch (err: unknown) {
    const mensaje = err instanceof Error ? err.message : 'Error al procesar el archivo'
    return NextResponse.json({ ok: false, error: mensaje }, { status: 500 })
  }
}
