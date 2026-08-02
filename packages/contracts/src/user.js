"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userSchema = exports.createUserSchema = void 0;
const zod_1 = require("zod");
// Single source of truth for the "shape of a user". Used by:
// - react-hook-form on the web (zodResolver)
// - NestJS DTO validation (nestjs-zod) for the mobile API
// - packages/core as the input/output type for UserService
// Change a field here and every layer catches the mismatch at compile time.
exports.createUserSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    name: zod_1.z.string().min(1).max(100).optional(),
});
exports.userSchema = zod_1.z.object({
    id: zod_1.z.string(),
    email: zod_1.z.string().email(),
    name: zod_1.z.string().nullable(),
    createdAt: zod_1.z.date(),
});
