import { google, gmail_v1 } from "googleapis";
import { env } from "@/lib/env";
import { db } from "@/lib/db";
import type { GmailConnection } from "@prisma/client";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/userinfo.email",
];

function oauth2Client() {
  return new google.auth.OAuth2(
    env.googleClientId,
    env.googleClientSecret,
    `${env.appUrl}/api/gmail/callback`,
  );
}

/** URL to send the owner to in order to grant Gmail access. */
export function gmailAuthUrl(state: string): string {
  return oauth2Client().generateAuthUrl({
    access_type: "offline", // required to receive a refresh_token
    prompt: "consent", // re-prompt so a refresh_token is always returned
    scope: SCOPES,
    state,
  });
}

/** Exchange an OAuth code; returns tokens + the connected gmail address. */
export async function exchangeGmailCode(code: string) {
  const client = oauth2Client();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);

  const gmail = google.gmail({ version: "v1", auth: client });
  const profile = await gmail.users.getProfile({ userId: "me" });
  return {
    tokens,
    email: profile.data.emailAddress ?? "",
    historyId: profile.data.historyId ?? undefined,
  };
}

/** Authenticated Gmail API client for a stored connection (auto-refreshes). */
export async function gmailFor(conn: GmailConnection) {
  const client = oauth2Client();
  client.setCredentials({
    refresh_token: conn.refreshToken,
    access_token: conn.accessToken ?? undefined,
    expiry_date: conn.expiryDate ? Number(conn.expiryDate) : undefined,
  });
  // Persist refreshed access tokens so we don't hammer the token endpoint.
  client.on("tokens", async (t) => {
    await db.gmailConnection.update({
      where: { id: conn.id },
      data: {
        accessToken: t.access_token ?? undefined,
        expiryDate: t.expiry_date ? BigInt(t.expiry_date) : undefined,
      },
    });
  });
  return google.gmail({ version: "v1", auth: client });
}

// ── Message decoding ────────────────────────────────────────────────────────

function header(msg: gmail_v1.Schema$Message, name: string): string {
  return (
    msg.payload?.headers?.find(
      (h) => h.name?.toLowerCase() === name.toLowerCase(),
    )?.value ?? ""
  );
}

function decodePart(part?: gmail_v1.Schema$MessagePart): string {
  if (!part) return "";
  if (part.mimeType === "text/plain" && part.body?.data)
    return Buffer.from(part.body.data, "base64url").toString("utf8");
  for (const p of part.parts ?? []) {
    const t = decodePart(p);
    if (t) return t;
  }
  return "";
}

export interface GmailMessage {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  text: string;
  internalDate: number;
}

export async function fetchMessage(
  gmail: gmail_v1.Gmail,
  id: string,
): Promise<GmailMessage | null> {
  const res = await gmail.users.messages.get({ userId: "me", id, format: "full" });
  const msg = res.data;
  return {
    id: msg.id ?? id,
    threadId: msg.threadId ?? "",
    from: header(msg, "from"),
    subject: header(msg, "subject"),
    text: decodePart(msg.payload).slice(0, 20000),
    internalDate: Number(msg.internalDate ?? 0),
  };
}

/** List inbox messages newer than `afterEpochSeconds` (excluding sent mail). */
export async function listInboxSince(
  gmail: gmail_v1.Gmail,
  afterEpochSeconds: number,
): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const res = await gmail.users.messages.list({
      userId: "me",
      q: `in:inbox -from:me -in:chats after:${afterEpochSeconds}`,
      maxResults: 100,
      pageToken,
    });
    ids.push(...(res.data.messages ?? []).map((m) => m.id!).filter(Boolean));
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken && ids.length < 300);
  return ids;
}

// ── Sending ─────────────────────────────────────────────────────────────────

export async function sendGmail(params: {
  conn: GmailConnection;
  to: string;
  subject: string;
  body: string;
  threadId?: string; // keeps replies threaded in Gmail
}): Promise<{ id: string; threadId: string }> {
  const gmail = await gmailFor(params.conn);
  const raw = Buffer.from(
    [
      `To: ${params.to}`,
      `Subject: ${params.subject}`,
      `Content-Type: text/plain; charset="UTF-8"`,
      `MIME-Version: 1.0`,
      "",
      params.body,
    ].join("\r\n"),
  ).toString("base64url");

  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw, threadId: params.threadId },
  });
  return { id: res.data.id ?? "", threadId: res.data.threadId ?? params.threadId ?? "" };
}
