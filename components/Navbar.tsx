'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Rol } from '@/lib/types'

interface NavbarProps {
  rol: Rol
  nombre: string
}

export default function Navbar({ rol, nombre }: NavbarProps) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const links: { href: string; label: string; roles: Rol[] }[] = [
    { href: '/registro', label: 'Nueva venta', roles: ['vendedora', 'admin'] },
    { href: '/registro/historial', label: 'Mis ventas', roles: ['vendedora', 'admin'] },
    { href: '/reinscripciones', label: 'Nueva reinscripción', roles: ['sac', 'admin'] },
    { href: '/reinscripciones/historial', label: 'Reinscripciones', roles: ['sac', 'admin'] },
  ]

  const visible = links.filter(l => l.roles.includes(rol))

  return (
    <nav className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-6">
        <span className="font-semibold text-violet-700 text-sm tracking-wide">ADIPA</span>
        <div className="flex gap-1">
          {visible.map(l => (
            <Link
              key={l.href}
              href={l.href}
              className={`px-3 py-1.5 rounded-md text-sm transition ${
                pathname === l.href
                  ? 'bg-violet-100 text-violet-700 font-medium'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {l.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <span className="text-sm text-gray-500">{nombre}</span>
        <button
          onClick={handleSignOut}
          className="text-sm text-gray-500 hover:text-gray-800 transition"
        >
          Salir
        </button>
      </div>
    </nav>
  )
}
