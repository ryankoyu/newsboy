"use server";

import { redirect } from "next/navigation";
import {
  isAdminConfigured,
  isSessionSigningConfigured,
  verifyPassword,
} from "@/lib/admin/auth";
import { setAdminSessionCookie } from "@/lib/admin/session";

export interface LoginState {
  error?: string;
}

export async function loginAction(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  if (!isAdminConfigured()) {
    return { error: "ADMIN_PASSWORD가 설정되어 있지 않습니다. web/.env.local을 확인하세요." };
  }

  // Checked before the password so a misconfigured deploy explains itself
  // rather than throwing out of setAdminSessionCookie() below.
  if (!isSessionSigningConfigured()) {
    return {
      error:
        "ADMIN_SESSION_SECRET가 설정되어 있지 않아 로그인 세션을 만들 수 없습니다. 이 환경의 환경변수를 확인하세요.",
    };
  }

  const password = String(formData.get("password") ?? "");
  if (!verifyPassword(password)) {
    return { error: "비밀번호가 올바르지 않습니다." };
  }

  await setAdminSessionCookie();

  const from = String(formData.get("from") ?? "");
  redirect(from.startsWith("/admin") ? from : "/admin");
}
