import { connection } from "next/server";
import { fetchGatewayHealth } from "@/lib/features/server/gateway-client";
import { WorkspaceReadinessSync } from "./workspace-provider";

export async function WorkspaceReadinessHydrator() {
  await connection();
  const snapshot = await fetchGatewayHealth();
  return <WorkspaceReadinessSync snapshot={snapshot} />;
}
