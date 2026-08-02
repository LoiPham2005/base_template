import {
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { UserAlreadyExistsError, UserService } from "@repo/core";
import { CreateUserDto } from "./user.dto";

@ApiTags("users")
@Controller("users")
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @ApiOperation({ summary: "List users" })
  list() {
    return this.userService.list();
  }

  @Get(":id")
  @ApiOperation({ summary: "Get a user by id" })
  async findOne(@Param("id") id: string) {
    const user = await this.userService.findById(id);
    if (!user) {
      throw new NotFoundException(`User "${id}" not found`);
    }
    return user;
  }

  @Post()
  @ApiOperation({ summary: "Create a user" })
  async create(@Body() dto: CreateUserDto) {
    try {
      return await this.userService.create(dto);
    } catch (err) {
      if (err instanceof UserAlreadyExistsError) {
        throw new ConflictException(err.message);
      }
      throw err;
    }
  }
}
