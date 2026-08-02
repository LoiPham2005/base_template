"use server";

import { revalidatePath } from "next/cache";
import { core, UserAlreadyExistsError } from "@repo/core";
import { createUserSchema } from "@repo/contracts";

export type CreateUserState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

export async function createUserAction(
  _prevState: CreateUserState,
  formData: FormData,
): Promise<CreateUserState> {
  const parsed = createUserSchema.safeParse({
    email: formData.get("email"),
    name: formData.get("name") || undefined,
  });

  if (!parsed.success) {
    return { fieldErrors: parsed.error.flatten().fieldErrors };
  }

  try {
    // Server Component/Action calls the core service directly, in the
    // same process — no HTTP round-trip to apps/api.
    await core.user.create(parsed.data);
  } catch (err) {
    if (err instanceof UserAlreadyExistsError) {
      return { error: err.message };
    }
    throw err;
  }

  revalidatePath("/users");
  return {};
}
