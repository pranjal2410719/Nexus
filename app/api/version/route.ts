// GET /api/version — returns the current Nexus version
import { json } from "@/lib/http/response";

export async function GET() {
  return json({
    version: process.env.NEXUS_VERSION ?? "3.1.0",
    service: "nexus",
    name: "Nexus",
    description: "Open-source multi-tenant GitHub commit scheduler",
  });
}

export async function OPTIONS() {
  return new Response(null, { status: 204 });
}
