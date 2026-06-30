'use client'

import { Pais, LABEL_IDENTIFICADOR } from '@/lib/types'

export interface InscritoData {
  nombre: string
  apellido: string
  identificador_fiscal: string
  celular: string
  correo: string
}

interface Props {
  index: number
  pais: Pais
  value: InscritoData
  onChange: (index: number, field: keyof InscritoData, value: string) => void
  onRemove?: (index: number) => void
  canRemove: boolean
}

export default function InscritoFields({ index, pais, value, onChange, onRemove, canRemove }: Props) {
  const label = LABEL_IDENTIFICADOR[pais] ?? 'ID fiscal'

  return (
    <div className="border border-gray-200 rounded-xl p-4 space-y-3 bg-gray-50">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-gray-700">Persona {index + 1}</span>
        {canRemove && (
          <button
            type="button"
            onClick={() => onRemove?.(index)}
            className="text-xs text-red-500 hover:text-red-700 transition"
          >
            Eliminar
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Nombre</label>
          <input
            required
            value={value.nombre}
            onChange={e => onChange(index, 'nombre', e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Apellido</label>
          <input
            required
            value={value.apellido}
            onChange={e => onChange(index, 'apellido', e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
          <input
            required
            value={value.identificador_fiscal}
            onChange={e => onChange(index, 'identificador_fiscal', e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Celular</label>
          <input
            required
            value={value.celular}
            onChange={e => onChange(index, 'celular', e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Correo</label>
        <input
          required
          type="email"
          value={value.correo}
          onChange={e => onChange(index, 'correo', e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
        />
      </div>
    </div>
  )
}
