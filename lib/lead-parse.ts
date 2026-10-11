// Parse inbound emails into lead records.
//
// Home-services leads typically arrive as contact-form notification emails
// (website forms, Google Business, Yelp, Thumbtack, Angi, Facebook lead ads),
// where the From: address is the platform — the real lead data is in the body.
// Direct emails from a person are also handled.

export interface InboundEmail {
  from: string; // "Name <addr@x.com>" or "addr@x.com"
  subject?: string;
  text?: string;
  html?: string;
}

export interface ParsedLead {
  name?: string;
  email?: string;
  phone?: string;
  source?: string;
  summary?: string;
  /** False when the message doesn't look like a lead (newsletter, auto-reply…). */
  isLead: boolean;
  /** Why isLead is false, for logging. */
  skipReason?: string;
}

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const PHONE_RE = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/;

const NON_LEAD_SENDER_RE =
  /(no-?reply|donotreply|mailer-daemon|newsletter|notifications?@|bounce|postmaster)/i;

const AUTO_REPLY_RE =
  /(out of office|auto-?reply|automatic reply|delivery (status )?notification|undeliverable)/i;

// Sources we can recognize from the sender/subject.
const SOURCE_HINTS: [RegExp, string][] = [
  [/google|googlemybusiness|business\.google/i, "Google Business"],
  [/yelp/i, "Yelp"],
  [/thumbtack/i, "Thumbtack"],
  [/angi|angie's/i, "Angi"],
  [/facebook|fb\.com|instagram/i, "Facebook/Instagram"],
  [/homeadvisor/i, "HomeAdvisor"],
  [/nextdoor/i, "Nextdoor"],
  [/wordpress|wpforms|contact form|website|wix|squarespace|webflow/i, "Website form"],
];

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ");
}

function parseAddress(raw: string): { name?: string; email?: string } {
  const m = raw.match(/^(.*?)\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].replace(/["']/g, "").trim() || undefined, email: m[2].trim() };
  const e = raw.match(EMAIL_RE)?.[0];
  return { email: e };
}

/** Pull a labeled field like "Name: Jane Doe" out of a contact-form body. */
function fieldValue(body: string, labels: string[]): string | undefined {
  for (const label of labels) {
    const re = new RegExp(`^\\s*(?:${label})\\s*[:\\-]\\s*(.+)$`, "im");
    const m = body.match(re);
    if (m?.[1]) return m[1].trim();
  }
  return undefined;
}

export function parseLeadEmail(inbound: InboundEmail): ParsedLead {
  const sender = parseAddress(inbound.from ?? "");
  const subject = inbound.subject ?? "";
  const body = (inbound.text ?? stripHtml(inbound.html ?? "")).replace(/\r/g, "");

  // Filter obvious non-leads before doing any extraction.
  if (sender.email && NON_LEAD_SENDER_RE.test(sender.email) && !EMAIL_RE.test(body))
    return { isLead: false, skipReason: `sender looks automated: ${sender.email}` };
  if (AUTO_REPLY_RE.test(subject) || AUTO_REPLY_RE.test(body.slice(0, 300)))
    return { isLead: false, skipReason: "auto-reply / bounce" };
  if (!sender.email && !EMAIL_RE.test(body))
    return { isLead: false, skipReason: "no email address found anywhere" };

  const source =
    SOURCE_HINTS.find(([re]) => re.test(`${inbound.from} ${subject}`))?.[1] ??
    (NON_LEAD_SENDER_RE.test(sender.email ?? "") ? "Email" : "Direct email");

  // Labeled fields win (contact forms); fall back to first email/phone in body.
  const name =
    fieldValue(body, ["full ?name", "name", "customer", "your name"]) ??
    fieldValue(body, ["first ?name"]);
  const emailField = fieldValue(body, ["e-?mail", "email address"]);
  const phoneField = fieldValue(body, [
    "phone( number)?",
    "mobile",
    "cell",
    "telephone",
    "best number",
  ]);

  const bodyEmail = emailField?.match(EMAIL_RE)?.[0] ?? body.match(EMAIL_RE)?.[0];
  const bodyPhone = phoneField?.match(PHONE_RE)?.[0] ?? body.match(PHONE_RE)?.[0];

  // If the sender looks like a real person and no body email, the lead IS the sender.
  const senderLooksHuman = sender.email && !NON_LEAD_SENDER_RE.test(sender.email);
  const email = bodyEmail ?? (senderLooksHuman ? sender.email : undefined);
  const leadName =
    name?.replace(/[<>]/g, "") ?? (senderLooksHuman ? sender.name : undefined);

  // Summary: the "message/details" field, else the first meaningful body chunk.
  const explicitMessage = fieldValue(body, [
    "message",
    "details",
    "description",
    "comments?",
    "how can we help",
    "service needed",
    "inquiry",
  ]);
  const summary =
    explicitMessage ??
    (body
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 30)
      .slice(0, 3)
      .join(" ")
      .slice(0, 500) ||
      subject ||
      undefined);

  return {
    isLead: Boolean(email || bodyPhone || leadName),
    skipReason: email || bodyPhone || leadName ? undefined : "nothing extractable",
    name: leadName?.slice(0, 120),
    email,
    phone: bodyPhone,
    source,
    summary,
  };
}

/** Normalize US-ish phone numbers to E.164 for Twilio. Best-effort. */
export function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  return phone.startsWith("+") ? phone : `+${digits}`;
}
