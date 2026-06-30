import { createClient, createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'Sin archivo' }, { status: 400 })

  const service = createServiceClient()
  const timestamp = Date.now()
  const fileName = `comprobantes/${user.id}/${timestamp}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`

  const arrayBuffer = await file.arrayBuffer()
  const { data, error } = await service.storage
    .from('comprobantes')
    .upload(fileName, arrayBuffer, {
      contentType: file.type || 'application/pdf',
      upsert: false,
    })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: urlData } = service.storage.from('comprobantes').getPublicUrl(data.path)

  return NextResponse.json({ url: urlData.publicUrl })
}
