"use client";

import { useActionState } from "react";
import { createUserAction, type CreateUserState } from "./actions";

const initialState: CreateUserState = {};

export function UserForm() {
  const [state, formAction, isPending] = useActionState(createUserAction, initialState);

  return (
    <form action={formAction} style={{ display: "flex", gap: 8, marginBottom: 16 }}>
      <input name="email" type="email" placeholder="email" required />
      <input name="name" placeholder="name (optional)" />
      <button type="submit" disabled={isPending}>
        {isPending ? "Adding…" : "Add user"}
      </button>
      {state.error && <span style={{ color: "crimson" }}>{state.error}</span>}
      {state.fieldErrors?.email && (
        <span style={{ color: "crimson" }}>{state.fieldErrors.email[0]}</span>
      )}
    </form>
  );
}
