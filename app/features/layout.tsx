import { Suspense } from "react";
import { WorkspaceReadinessHydrator } from "@/components/features/readiness-stream";
import { WorkspaceProvider } from "@/components/features/workspace-provider";
import { WorkspaceShell } from "@/components/features/workspace-shell";

export default function FeaturesLayout({
  children,
}: LayoutProps<"/features">) {
  return (
    <WorkspaceProvider>
      <Suspense fallback={null}>
        <WorkspaceReadinessHydrator />
      </Suspense>
      <WorkspaceShell>{children}</WorkspaceShell>
    </WorkspaceProvider>
  );
}
