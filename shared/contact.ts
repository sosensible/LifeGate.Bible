// What the public contact form may submit.
import { z } from 'zod'

export const contactSchema = z.object({
  name: z.string().trim().min(1, 'Please give your name').max(100),
  email: z.email('That does not look like an email address').max(200),
  // Optional, and deliberately unvalidated beyond a length: people write phone
  // numbers every way imaginable and rejecting one loses a message.
  phone: z.string().trim().max(50).optional().or(z.literal('')),
  subject: z.string().trim().min(1, 'Please give a subject').max(200),
  message: z.string().trim().min(1, 'Please write a message').max(5000),
})

export type ContactSubmission = z.infer<typeof contactSchema>
