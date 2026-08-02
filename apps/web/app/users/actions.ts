"use server";

import { revalidatePath } from "next/cache";
import { createUserSchema } from "@repo/contracts";
import { apiFetch, ApiError } from "@/lib/api";

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
    // Same POST /users the mobile app calls — apps/api is the single
    // place that enforces "email must be unique", not duplicated here.
    await apiFetch("/users", {
      method: "POST",
      body: JSON.stringify(parsed.data),
    });
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      return { error: err.message };
    }
    throw err;
  }

  revalidatePath("/users");
  return {};
}
