"use server";

import { redirect } from "next/navigation";
import { isAdminConfigured, verifyPassword } from "@/lib/admin/auth";
import { setAdminSessionCookie } from "@/lib/admin/session";

export interface LoginState {
  error?: string;
}

export async function loginAction(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  if (!isAdminConfigured()) {
    return { error: "ADMIN_PASSWORD가 설정되어 있지 않습니다. web/.env.local을 확인하세요." };
  }

  const password = String(formData.get("password") ?? "");
  if (!verifyPassword(password)) {
    return { error: "비밀번호가 올바르지 않습니다." };
  }

  await setAdminSessionCookie();

  const from = String(formData.get("from") ?? "");
  redirect(from.startsWith("/admin") ? from : "/admin");
}
