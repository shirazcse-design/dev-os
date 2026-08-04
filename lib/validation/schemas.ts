import { z } from 'zod'

export const loginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(200),
})

export const extractRequestSchema = z.object({
  contract_id: z.string().uuid(),
  custom_terms: z.array(z.string().min(1).max(100)).max(5).optional().default([]),
})

export const chatRequestSchema = z.object({
  session_id: z.string().uuid().nullable(),
  contract_id: z.string().uuid(),
  message: z.string().min(1).max(2000),
})

export const termUpdateSchema = z.object({
  value: z.string().min(1).max(2000),
})

export const feedbackRequestSchema = z.object({
  contract_id: z.string().uuid(),
  rating: z.enum(['up', 'down']),
  comment: z.string().max(1000).nullable().optional(),
})
