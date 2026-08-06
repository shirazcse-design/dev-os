import { test, expect } from '@playwright/test'
import path from 'node:path'

// Runs against the real dev Supabase project (auth, RLS, storage are exercised
// for real) with OpenAI mocked via tests/e2e/mock-openai-server.mjs — see
// playwright.config.ts and docs/security/security-plan.md for why. A fresh
// account is created per run so the suite never depends on pre-existing data.
const FIXTURE_PDF = path.join(__dirname, 'fixtures', 'e2e-nda.pdf')

test('critical path: sign-up, upload/extract, term edit, chat memory layer, hallucination guard', async ({
  page,
}) => {
  test.setTimeout(90_000)
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`
  const password = 'TestPass1234!'

  await test.step('sign-up redirects to the dashboard', async () => {
    await page.goto('/sign-up')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill(password)
    await page.getByRole('button', { name: 'Get started' }).click()
    await expect(page).toHaveURL(/\/dashboard/)
  })

  await test.step('upload and extract a contract', async () => {
    await page.goto('/upload')
    await page.getByRole('button', { name: /NDA/ }).click()
    await page.locator('input[type="file"]').setInputFiles(FIXTURE_PDF)
    await page.getByRole('button', { name: 'Upload', exact: true }).click()
    await page.getByRole('button', { name: 'Process Contract' }).click()
    await expect(page).toHaveURL(/\/contracts\/[^/]+$/, { timeout: 30_000 })
    await expect(page.getByText('Parties').first()).toBeVisible()
    await expect(page.getByText('Acme Robotics', { exact: false }).first()).toBeVisible()
  })

  await test.step('inline term edit persists after reload', async () => {
    const partiesValue = page.getByRole('button', { name: 'Acme Robotics, Inc. and Beacon Analytics, LLC' })
    await partiesValue.click()
    // Scoped to exclude FeedbackWidget's textarea, which is also on the page.
    const textarea = page.locator('textarea:not([placeholder])')
    await textarea.fill('Acme Robotics, Inc. and Beacon Analytics, LLC (amended)')
    await page.getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Edited', { exact: true })).toBeVisible()

    await page.reload()
    await expect(
      page.getByRole('button', { name: 'Acme Robotics, Inc. and Beacon Analytics, LLC (amended)' })
    ).toBeVisible()
  })

  await test.step('chat: a document question is answered with a page citation', async () => {
    await page.getByRole('button', { name: 'Chat' }).last().click()
    const input = page.getByPlaceholder('Ask a question…')
    await input.fill('What is the governing law of this contract?')
    await page.getByRole('button', { name: 'Send' }).click()
    await expect(page.getByText('[Page 1]')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('From document', { exact: true })).toBeVisible()
  })

  await test.step('chat: a conversation question is answered from history, not the document', async () => {
    const input = page.getByPlaceholder('Ask a question…')
    await input.fill('What did I just ask you earlier in this conversation?')
    await page.getByRole('button', { name: 'Send' }).click()
    await expect(page.getByText('[From conversation]')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('From conversation', { exact: true })).toBeVisible()
  })

  await test.step('chat: an off-document question triggers the hallucination guard, not a fabricated answer', async () => {
    const input = page.getByPlaceholder('Ask a question…')
    await input.fill('What does the quantum teleportation clause say?')
    await page.getByRole('button', { name: 'Send' }).click()
    await expect(page.getByText('I cannot find this in the document.')).toBeVisible({ timeout: 15_000 })
  })
})
