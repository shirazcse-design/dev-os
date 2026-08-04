import { NextRequest, NextResponse } from 'next/server'
import { notFound } from '@/lib/api/errors'
import { isAuthFailure, requireAuth } from '@/lib/security/authGuard'
import type { GetContractResponse } from '@/types'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth()
  if (isAuthFailure(auth)) return auth.response
  const { user, supabase } = auth

  const { data: contract, error: contractError } = await supabase
    .from('contracts')
    .select('id, contract_type, file_name, file_path, status, page_count, created_at, contract_text')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single()
  if (contractError || !contract) return notFound('CONTRACT_NOT_FOUND', 'Contract not found.')

  const { data: keyTerms } = await supabase
    .from('key_terms')
    .select('*')
    .eq('contract_id', params.id)
    .order('created_at', { ascending: true })

  let signedPdfUrl: string | null = null
  if (contract.file_path) {
    const { data: signed } = await supabase.storage
      .from('contracts')
      .createSignedUrl(contract.file_path, 3600)
    signedPdfUrl = signed?.signedUrl ?? null
  }

  const body: GetContractResponse = {
    contract: {
      id: contract.id,
      contract_type: contract.contract_type,
      file_name: contract.file_name,
      status: contract.status,
      page_count: contract.page_count,
      created_at: contract.created_at,
      contract_text: contract.contract_text,
    },
    key_terms: keyTerms ?? [],
    signed_pdf_url: signedPdfUrl,
  }

  return NextResponse.json(body)
}
