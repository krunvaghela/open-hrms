import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

export function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new BadRequestException(`${issue.path.join('.') || 'Request'}: ${issue.message}`);
  }
  return result.data;
}
export const email = z.string().trim().toLowerCase().email().max(254);
export const password = z.string().min(12, 'Use at least 12 characters').max(128);
export const name = z.string().trim().min(2).max(100);
export const text = z.string().trim().max(200);
export const role = z.enum(['SUPER_ADMIN', 'ADMIN', 'HR', 'EMPLOYEE']);
export const companySchema = z
  .object({
    name,
    state: text.default(''),
    city: text.default(''),
    address: z.string().trim().max(500).default(''),
    timezone: z
      .string()
      .default('Asia/Kolkata')
      .refine((value) => {
        try {
          new Intl.DateTimeFormat('en', { timeZone: value });
          return true;
        } catch {
          return false;
        }
      }, 'Choose a valid timezone'),
  })
  .strict();
export const employeeFields = {
  name,
  department: text.default(''),
  designation: text.default(''),
  phone: z.string().trim().max(30).default(''),
  employmentType: z.enum(['Full-time', 'Part-time', 'Contract', 'Intern']).default('Full-time'),
  status: z.enum(['Active', 'Onboarding', 'Inactive']).default('Active'),
  joiningDate: z.iso.date(),
  managerId: z.uuid().nullable().default(null),
};
