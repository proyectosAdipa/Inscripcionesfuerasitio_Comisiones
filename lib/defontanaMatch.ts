import { createServiceClient } from '@/lib/supabase/server'

export interface FilaDefontana {
  id_servicio: string
  descripcion: string
}

const PREFIJOS_A_QUITAR = [
  /^as\s*-\s*/i,
  /^curso:\s*/i,
  /^diplomado (en|de)\s*/i,
  /^post[íi]tulo (en|de)\s*/i,
  /^certificaci[óo]n (en|de)\s*/i,
  /^acreditaci[óo]n (en|de)\s*/i,
  /^actualizaci(ó|o)n(es)? en\s*/i,
]

export function normalizar(texto: string): string {
  let t = texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita tildes
    .toLowerCase()
    .trim()

  for (const prefijo of PREFIJOS_A_QUITAR) {
    t = t.replace(prefijo, '')
  }

  return t.replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim()
}

export async function ejecutarSyncDefontana(filas: FilaDefontana[], origen: 'n8n' | 'upload_manual') {
  const service = createServiceClient()

  const { data: programasCL } = await service
    .from('programas')
    .select('id, nombre, wp_post_id')
    .eq('pais', 'CL')
    .eq('activo', true)

  interface ProgramaBase { id: string; nombre: string; wp_post_id: string }
  interface ProgramaConNormalizado extends ProgramaBase { nombreNormalizado: string }

  const programas: ProgramaConNormalizado[] = (programasCL ?? []).map((p: ProgramaBase) => ({
    ...p,
    nombreNormalizado: normalizar(p.nombre),
  }))

  let actualizados = 0
  const ambiguos: {
    id_servicio: string
    descripcion: string
    candidatos: { nombre: string; ids: string[] }[]
  }[] = []
  const sinMatch: { id_servicio: string; descripcion: string }[] = []

  for (const fila of filas) {
    const descNorm = normalizar(fila.descripcion)
    if (!descNorm) continue

    // Match por contención en ambos sentidos (uno contiene al otro)
    const candidatos = programas.filter(
      p => p.nombreNormalizado.includes(descNorm) || descNorm.includes(p.nombreNormalizado)
    )

    if (candidatos.length === 0) {
      sinMatch.push({ id_servicio: fila.id_servicio, descripcion: fila.descripcion })
      continue
    }

    // Si hay más de un NOMBRE distinto entre los candidatos, es ambiguo (podrían ser cursos distintos)
    const nombresUnicos = new Set(candidatos.map(c => c.nombreNormalizado))
    if (nombresUnicos.size > 1) {
      const candidatosPorNombre = new Map<string, { nombre: string; ids: string[] }>()
      for (const c of candidatos) {
        if (!candidatosPorNombre.has(c.nombreNormalizado)) {
          candidatosPorNombre.set(c.nombreNormalizado, { nombre: c.nombre, ids: [] })
        }
        candidatosPorNombre.get(c.nombreNormalizado)!.ids.push(c.id)
      }
      ambiguos.push({
        id_servicio: fila.id_servicio,
        descripcion: fila.descripcion,
        candidatos: Array.from(candidatosPorNombre.values()),
      })
      continue
    }

    // Alta confianza: mismo nombre normalizado, puede haber varias filas (varias vendedoras) -> actualizar todas
    await service
      .from('programas')
      .update({ id_defontana: fila.id_servicio })
      .in('id', candidatos.map(c => c.id))

    actualizados += candidatos.length
  }

  const detalle = {
    origen,
    total_filas_hoja: filas.length,
    programas_actualizados: actualizados,
    ambiguos,
    sin_match: sinMatch,
  }

  await service.from('sync_log').insert({
    flujo: 'defontana',
    resultado: 'ok',
    detalle,
  })

  return detalle
}
