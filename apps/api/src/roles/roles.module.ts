import { Module } from "@nestjs/common";
import { RoleService, core } from "@repo/core";
import { RolesController } from "./roles.controller";

@Module({
  controllers: [RolesController],
  providers: [{ provide: RoleService, useValue: core.role }],
})
export class RolesModule {}
