import axios from "axios";
import { api } from "./axios";
import type { AuthUser } from "../context/AuthContext";
export interface PasswordSessionResponse { accessToken: string; user: AuthUser; message: string }
export interface CodeRequestResponse { challengeId: string; message: string; resendAfter: number; expiresIn: number }
export interface CodeVerifyResponse { verified: boolean; expiresIn: number }
export type PasswordFlow = "recovery" | "settings";
export const passwordEndpoints = (flow: PasswordFlow) => flow === "recovery"
  ? { request: "/auth/password/request", verify: "/auth/password/verify", complete: "/auth/password/reset" }
  : { request: "/auth/password/settings/request", verify: "/auth/password/settings/verify", complete: "/auth/password/settings/complete" };
export function passwordError(error: unknown): string {
  if (axios.isAxiosError<{ message?: string }>(error)) return error.response?.data?.message ?? "Could not reach the service. Please try again.";
  return "This request could not be completed. Please try again.";
}
export function validatePassword(password: string, confirm: string): string {
  if (Array.from(password).length < 12 || new TextEncoder().encode(password).length > 72) return "Use at least 12 characters and at most 72 UTF-8 bytes.";
  if (password !== confirm) return "The passwords do not match.";
  return "";
}
export async function getAccount() { return (await api.get<{ user: AuthUser }>("/auth/account")).data.user; }
