import { Pais } from '@/lib/types'

const PAIS_MAP: Record<string, Pais> = {
  chile: 'CL',
  méxico: 'MX',
  mexico: 'MX',
  colombia: 'CO',
}

export function normalizarPais(valor: string): Pais | null {
  return PAIS_MAP[(valor ?? '').trim().toLowerCase()] ?? null
}
