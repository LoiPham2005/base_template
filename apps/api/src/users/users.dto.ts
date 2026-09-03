import { createZodDto } from "nestjs-zod";
import {
  assignRolesSchema,
  createUserSchema,
  listUsersSchema,
  setUserPermissionSchema,
  setUserStatusSchema,
  updateUserSchema,
} from "@repo/contracts";

export class CreateUserDto extends createZodDto(createUserSchema) {}
export class UpdateUserDto extends createZodDto(updateUserSchema) {}
export class ListUsersDto extends createZodDto(listUsersSchema) {}
export class SetUserStatusDto extends createZodDto(setUserStatusSchema) {}
export class AssignRolesDto extends createZodDto(assignRolesSchema) {}
export class SetUserPermissionDto extends createZodDto(setUserPermissionSchema) {}
