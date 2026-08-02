import { createZodDto } from "nestjs-zod";
import { createUserSchema } from "@repo/contracts";

// Same Zod schema the web app's react-hook-form uses — a mobile client
// and the web form can never validate a "user" differently.
export class CreateUserDto extends createZodDto(createUserSchema) {}
