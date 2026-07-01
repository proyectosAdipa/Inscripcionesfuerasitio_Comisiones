export type Rol = 'admin' | 'vendedora' | 'sac' | 'cierre'
export type Pais = 'CL' | 'MX' | 'CO'
export type OrigenVenta = 'vendedora' | 'sac'
export type TipoVenta = 'individual' | 'empresa'
export type EstadoInscripcion = 'pendiente' | 'inscrito' | 'parcial' | 'error' | 'cancelado'
export type EstadoInscrito = 'pendiente' | 'inscrito' | 'error'

export interface Usuario {
  id: string
  nombre: string
  email: string
  rol: Rol
  activo: boolean
  creado_en: string
}

export interface Vendedora {
  id: string
  nombre: string
  pais: Pais
  moneda: string
  comision_porcentaje: number
  activo: boolean
  creado_en: string
}

export interface Programa {
  id: string
  wp_post_id: string
  nombre: string
  tipo: string
  vendedora_id: string
  id_defontana: string | null
  pais: Pais
  activo: boolean
  creado_en: string
}

export interface MetodoPago {
  id: string
  codigo: string
  label: string
  activo: boolean
}

export interface Venta {
  id: string
  origen: OrigenVenta
  vendedora_id: string | null
  tipo: TipoVenta
  es_factura: boolean
  nombre_empresa: string | null
  identificador_fiscal_empresa: string | null
  programa_id: string
  wp_post_id: string
  metodo_pago_id: string
  monto_total: number
  cupon: string | null
  comprobante_url: string | null
  fecha_venta: string
  mes: string
  numero_pedido: string | null
  numero_boleta: string | null
  numero_factura: string | null
  estado_inscripcion: EstadoInscripcion
  mensaje_error: string | null
  creado_por: string
  creado_en: string
  actualizado_en: string
  // joins
  programa?: Programa
  metodo_pago?: MetodoPago
  inscritos?: Inscrito[]
}

export interface Inscrito {
  id: string
  venta_id: string
  nombre: string
  apellido: string
  identificador_fiscal: string
  celular: string
  correo: string
  estado_inscripcion: EstadoInscrito
  mensaje_error: string | null
  numero_pedido: string | null
  numero_boleta: string | null
  numero_factura: string | null
  creado_en: string
  actualizado_en: string
}

export const LABEL_IDENTIFICADOR: Record<Pais, string> = {
  CL: 'RUT',
  MX: 'RFC',
  CO: 'NIT / Cédula',
}

export const ENROLLMENT_URL: Record<Pais, string> = {
  MX: 'https://adipa.mx/api/n8n/enrollment-offsite',
  CL: 'https://adipa.cl/api/n8n/enrollment-offsite',
  CO: 'https://adipa.co/api/n8n/enrollment-offsite',
}

/**
 * Marcador guardado en mensaje_error (venta e inscrito) cuando la inscripción
 * automática está desactivada (INSCRIPCION_AUTOMATICA=false). Permite al
 * frontend distinguir este caso de un error real de enrollment-offsite.
 */
export const MARCADOR_INSCRIPCION_DESACTIVADA = 'INSCRIPCION_AUTOMATICA_DESACTIVADA'

export function inscripcionAutomaticaActiva(): boolean {
  return process.env.INSCRIPCION_AUTOMATICA === 'true'
}
