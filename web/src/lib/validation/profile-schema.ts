import { z } from "zod";

export const profileSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(50, "Name must be less than 50 characters").optional().or(z.literal("")),
  email: z.string().email("Invalid email address").optional().or(z.literal("")),
  image: z.string().url("Invalid image URL").optional().or(z.literal("")),
});

export type ProfileUpdateInput = z.infer<typeof profileSchema>;
