import type { ContractType } from '@/types'

// Representative labelled examples used as few-shot guidance in the extraction system
// prompt. These are illustrative placeholders for MVP launch — swap in CUAD-sourced /
// legal-SME-annotated examples (per engineering-doc.md §10 Evaluation Strategy) once the
// offline eval suite is built.

const NDA_EXAMPLES = `
Example 1:
Contract excerpt (page 1): "This Non-Disclosure Agreement (\\"Agreement\\") is entered into as of March 3, 2025 (the \\"Effective Date\\") by and between Acme Robotics, Inc., a Delaware corporation (\\"Disclosing Party\\"), and Jordan Lee, an individual (\\"Receiving Party\\")."
Expected output: { "terms": [
  { "term_name": "Parties", "value": "Acme Robotics, Inc. and Jordan Lee", "page_number": 1, "confidence_score": 97, "source_sentence": "This Non-Disclosure Agreement (\\"Agreement\\") is entered into as of March 3, 2025 (the \\"Effective Date\\") by and between Acme Robotics, Inc., a Delaware corporation (\\"Disclosing Party\\"), and Jordan Lee, an individual (\\"Receiving Party\\")." },
  { "term_name": "Effective Date", "value": "March 3, 2025", "page_number": 1, "confidence_score": 98, "source_sentence": "This Non-Disclosure Agreement (\\"Agreement\\") is entered into as of March 3, 2025 (the \\"Effective Date\\") by and between Acme Robotics, Inc., a Delaware corporation (\\"Disclosing Party\\"), and Jordan Lee, an individual (\\"Receiving Party\\")." }
] }

Example 2:
Contract excerpt (page 2): "The Receiving Party shall hold all Confidential Information in strict confidence and shall not disclose such information to any third party without the prior written consent of the Disclosing Party, except as required by law."
Expected output: { "terms": [
  { "term_name": "Confidentiality Obligations", "value": "Receiving Party must hold Confidential Information in strict confidence and may not disclose to third parties without prior written consent, except as required by law.", "page_number": 2, "confidence_score": 95, "source_sentence": "The Receiving Party shall hold all Confidential Information in strict confidence and shall not disclose such information to any third party without the prior written consent of the Disclosing Party, except as required by law." }
] }

Example 3:
Contract excerpt (page 4): "This Agreement shall remain in effect for a period of three (3) years from the Effective Date and shall be governed by and construed in accordance with the laws of the State of Delaware."
Expected output: { "terms": [
  { "term_name": "Term & Duration", "value": "3 years from the Effective Date", "page_number": 4, "confidence_score": 96, "source_sentence": "This Agreement shall remain in effect for a period of three (3) years from the Effective Date and shall be governed by and construed in accordance with the laws of the State of Delaware." },
  { "term_name": "Governing Law", "value": "State of Delaware", "page_number": 4, "confidence_score": 96, "source_sentence": "This Agreement shall remain in effect for a period of three (3) years from the Effective Date and shall be governed by and construed in accordance with the laws of the State of Delaware." }
] }
`.trim()

const MSA_EXAMPLES = `
Example 1:
Contract excerpt (page 3): "Client shall pay Provider within thirty (30) days of receipt of each invoice. Invoices not paid within thirty (30) days shall accrue a late payment penalty of 1.5% per month on the outstanding balance."
Expected output: { "terms": [
  { "term_name": "Payment Terms", "value": "Net 30 days from invoice receipt", "page_number": 3, "confidence_score": 96, "source_sentence": "Client shall pay Provider within thirty (30) days of receipt of each invoice." },
  { "term_name": "Late Payment Penalty", "value": "1.5% per month on the outstanding balance", "page_number": 3, "confidence_score": 95, "source_sentence": "Invoices not paid within thirty (30) days shall accrue a late payment penalty of 1.5% per month on the outstanding balance." }
] }

Example 2:
Contract excerpt (page 5): "In no event shall either party's aggregate liability arising out of this Agreement exceed the total fees paid by Client in the twelve (12) months preceding the claim."
Expected output: { "terms": [
  { "term_name": "Liability Cap", "value": "Total fees paid by Client in the preceding 12 months", "page_number": 5, "confidence_score": 94, "source_sentence": "In no event shall either party's aggregate liability arising out of this Agreement exceed the total fees paid by Client in the twelve (12) months preceding the claim." }
] }

Example 3:
Contract excerpt (page 7): "Either party may terminate this Agreement for convenience upon sixty (60) days' prior written notice to the other party."
Expected output: { "terms": [
  { "term_name": "Termination Clause", "value": "Either party may terminate for convenience with 60 days' written notice", "page_number": 7, "confidence_score": 97, "source_sentence": "Either party may terminate this Agreement for convenience upon sixty (60) days' prior written notice to the other party." },
  { "term_name": "Notice Period", "value": "60 days", "page_number": 7, "confidence_score": 97, "source_sentence": "Either party may terminate this Agreement for convenience upon sixty (60) days' prior written notice to the other party." }
] }
`.trim()

export const FEW_SHOT_EXAMPLES: Record<ContractType, string> = {
  nda: NDA_EXAMPLES,
  msa: MSA_EXAMPLES,
}
