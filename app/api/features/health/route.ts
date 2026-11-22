import { connection } from "next/server";
import { fetchGatewayHealth } from "@/lib/features/server/gateway-client";
import {
  enforceHealthRateLimit,
  privateJsonResponse,
} from "@/lib/features/server/route-helpers";

export async function GET(request: Request) {
  await connection();
  const rateLimited = enforceHealthRateLimit(request);
  if (rateLimited) return rateLimited;

  const snapshot = await fetchGatewayHealth();
  return privateJsonResponse(snapshot, { status: 200 });
}
