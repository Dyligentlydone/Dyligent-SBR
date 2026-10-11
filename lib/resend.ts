import { env } from "@/lib/env";

// Thin REST wrapper for the Resend API (no SDK dep needed).
// Used for: sending when no Gmail is connected, and custom-domain
// verification so tenants can send as team@theirdomain.com.

async function api(path: string, init?: RequestInit) {
  const res = await fetch(`https://api.resend.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.resendKey}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(`Resend ${res.status}: ${json.message ?? text}`);
  return json;
}

export interface DomainRecord {
  record: string; // e.g. "SPF", "DKIM", "MX"
  name: string;
  type: string;
  value: string;
  status?: string;
  ttl?: string;
  priority?: number;
}

export async function resendCreateDomain(domain: string) {
  return api("/domains", {
    method: "POST",
    body: JSON.stringify({ name: domain }),
  }) as Promise<{ id: string; name: string; status: string; records: DomainRecord[] }>;
}

export async function resendGetDomain(id: string) {
  return api(`/domains/${id}`) as Promise<{ id: string; status: string; records: DomainRecord[] }>;
}

export async function resendVerifyDomain(id: string) {
  return api(`/domains/${id}/verify`, { method: "POST" });
}

export async function resendDeleteDomain(id: string) {
  return api(`/domains/${id}`, { method: "DELETE" });
}

export async function resendSend(params: {
  from: string;
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
}) {
  return api("/emails", {
    method: "POST",
    body: JSON.stringify({
      from: params.from,
      to: params.to,
      subject: params.subject,
      text: params.text,
      ...(params.replyTo ? { reply_to: params.replyTo } : {}),
    }),
  }) as Promise<{ id?: string }>;
}
