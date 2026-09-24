import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type CrmEvent = {
  event_id: string;
  contact_id: string;
  type: "opt_in" | "opt_out" | "contact_updated" | "conversation_started" |
    "conversation_message" | "conversation_closed" | "human_handoff" | "delivery_status";
  purpose?: string;
  source?: string;
  recorded_at?: string;
  details?: Record<string, unknown>;
};

function safeDetails(event: CrmEvent): Record<string, string> | null {
  const input = event.details ?? {};
  if (typeof input !== "object" || Array.isArray(input) || input === null) return null;
  const details: Record<string, string> = {};
  const allowed = event.type === "contact_updated"
    ? ["name", "phone", "state_uf", "municipality"]
    : event.type === "conversation_message"
      ? ["message_id", "direction", "content", "occurred_at"]
      : event.type === "delivery_status" ? ["message_id", "status"] : [];
  for (const key of allowed) {
    if (input[key] !== undefined) {
      if (typeof input[key] !== "string") return null;
      details[key] = input[key];
    }
  }
  if (event.type === "conversation_message" && (
    !details.message_id || details.message_id.length > 120 ||
    !["incoming", "outgoing"].includes(details.direction) ||
    !details.content || details.content.length > 4000 ||
    !details.occurred_at || !Number.isFinite(Date.parse(details.occurred_at))
  )) return null;
  if (event.type === "contact_updated" && (
    (details.name?.length ?? 0) > 200 || (details.municipality?.length ?? 0) > 120 ||
    (details.phone !== undefined && !/^\+?[0-9]{10,15}$/.test(details.phone)) ||
    (details.state_uf !== undefined && !/^[A-Z]{2}$/.test(details.state_uf))
  )) return null;
  if (event.type === "delivery_status" && (
    !details.message_id || details.message_id.length > 120 ||
    !["sent", "delivered", "read", "failed"].includes(details.status)
  )) return null;
  return details;
}

function validEvent(value: unknown): value is CrmEvent {
  if (typeof value !== "object" || value === null) return false;
  const event = value as Record<string, unknown>;
  return typeof event.event_id === "string" && event.event_id.length > 0 && event.event_id.length <= 120 &&
    typeof event.contact_id === "string" && event.contact_id.length > 0 && event.contact_id.length <= 120 &&
    ["opt_in", "opt_out", "contact_updated", "conversation_started",
      "conversation_message", "conversation_closed", "human_handoff", "delivery_status"].includes(String(event.type)) &&
    (event.type !== "opt_in" || (
      typeof event.purpose === "string" && event.purpose.length > 0 && event.purpose.length <= 250 &&
      typeof event.source === "string" && event.source.length > 0 && event.source.length <= 250 &&
      typeof event.recorded_at === "string" && Number.isFinite(Date.parse(event.recorded_at))
    ));
}

export async function POST(request: NextRequest) {
  const secret = process.env.CRM_WEBHOOK_SECRET;
  if (!secret || secret.length < 32) return NextResponse.json({ error: "CRM not configured" }, { status: 503 });

  const timestamp = request.headers.get("x-trade-timestamp") ?? "";
  const signature = request.headers.get("x-trade-signature") ?? "";
  if (!/^\d{10}$/.test(timestamp) || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300 ||
      !/^sha256=[a-f0-9]{64}$/.test(signature)) {
    return NextResponse.json({ error: "Invalid authentication" }, { status: 401 });
  }

  if (Number(request.headers.get("content-length") ?? 0) > 16_384) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }
  const body = await request.text();
  if (Buffer.byteLength(body, "utf8") > 16_384) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }
  const expected = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest();
  const provided = Buffer.from(signature.slice(7), "hex");
  if (!timingSafeEqual(expected, provided)) {
    return NextResponse.json({ error: "Invalid authentication" }, { status: 401 });
  }

  let payload: unknown;
  try { payload = JSON.parse(body); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!validEvent(payload)) return NextResponse.json({ error: "Invalid event" }, { status: 400 });
  const details = safeDetails(payload);
  if (details === null) return NextResponse.json({ error: "Invalid details" }, { status: 400 });

  try {
    const db = createAdminClient();
    const { data, error } = await db.rpc("ingest_integration_crm_event", {
      p_provider: "crm", p_event_id: payload.event_id, p_contact_id: payload.contact_id,
      p_type: payload.type, p_purpose: payload.purpose ?? null,
      p_source: payload.source ?? null, p_recorded_at: payload.recorded_at ?? null,
      p_details: details,
    });
    if (error) {
      console.error("CRM ingress failed", error.code);
      return NextResponse.json({ error: "Event not recorded" }, { status: 503 });
    }
    return NextResponse.json({ accepted: true, duplicate: data === false });
  } catch {
    return NextResponse.json({ error: "Event not recorded" }, { status: 503 });
  }
}
