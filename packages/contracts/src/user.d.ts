import { z } from "zod";
export declare const createUserSchema: z.ZodObject<{
    email: z.ZodString;
    name: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    email: string;
    name?: string | undefined;
}, {
    email: string;
    name?: string | undefined;
}>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export declare const userSchema: z.ZodObject<{
    id: z.ZodString;
    email: z.ZodString;
    name: z.ZodNullable<z.ZodString>;
    createdAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    email: string;
    name: string | null;
    id: string;
    createdAt: Date;
}, {
    email: string;
    name: string | null;
    id: string;
    createdAt: Date;
}>;
export type User = z.infer<typeof userSchema>;
