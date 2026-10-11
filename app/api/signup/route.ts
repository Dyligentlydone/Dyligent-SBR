import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";

const schema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(200),
});

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid name, email, or password (min 8 chars)" }, { status: 400 });

  const email = parsed.data.email.toLowerCase().trim();
  if (await db.user.findUnique({ where: { email } }))
    return NextResponse.json({ error: "An account with that email already exists" }, { status: 409 });

  await db.user.create({
    data: {
      email,
      name: parsed.data.name,
      passwordHash: await bcrypt.hash(parsed.data.password, 10),
    },
  });
  return NextResponse.json({ ok: true });
}
