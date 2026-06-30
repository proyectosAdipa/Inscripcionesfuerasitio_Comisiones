import { createClient, createServiceClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Navbar from '@/components/Navbar'
import { Rol } from '@/lib/types'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const service = createServiceClient()
  const { data: usuario } = await service
    .from('usuarios')
    .select('nombre, rol')
    .eq('id', user.id)
    .single()

  if (!usuario) redirect('/login')

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar rol={usuario.rol as Rol} nombre={usuario.nombre} />
      <main className="flex-1 px-6 py-6 max-w-6xl mx-auto w-full">
        {children}
      </main>
    </div>
  )
}
