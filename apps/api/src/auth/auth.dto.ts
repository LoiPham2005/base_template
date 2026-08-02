import { createZodDto } from "nestjs-zod";
import { loginSchema, registerSchema } from "@repo/contracts";

export class LoginDto extends createZodDto(loginSchema) {}
export class RegisterDto extends createZodDto(registerSchema) {}
