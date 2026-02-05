import { NextRequest, NextResponse } from "next/server";

const PROXY_URL = process.env.NEXT_PUBLIC_PROXY_URL || "http://localhost:4402";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || ""; // Server-only, NOT NEXT_PUBLIC_

export async function POST(request: NextRequest) {
  if (!ADMIN_TOKEN) {
    return NextResponse.json(
      { error: "Admin token not configured on server" },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();

    const res = await fetch(`${PROXY_URL}/admin/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ADMIN_TOKEN}`,
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Proxy registration failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
