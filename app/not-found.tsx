import { ArrowRight, ShieldAlert } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { FeatureIcon } from "@/components/features/feature-icon";
import { FEATURE_CATALOG } from "@/lib/features/catalog";

export default function NotFound() {
  return (
    <div className="relative isolate flex min-h-svh flex-col bg-canvas text-foreground">
      <header className="border-b border-outline bg-canvas">
        <div className="mx-auto flex min-h-16 w-full max-w-[60rem] items-center justify-between px-4 sm:px-6">
          <Link
            href="/"
            aria-label="Vanguard AV home"
            className="site-logo inline-flex min-h-11 items-center rounded-lg py-1"
          >
            <Image
              src="/vanguard-wordmark.png"
              alt="Vanguard AV"
              width={118}
              height={59}
              className="h-8 w-auto"
              priority
            />
          </Link>

          <Link
            href="/features"
            className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-foreground motion-safe:transition-colors motion-safe:duration-150 hover:bg-surface-hover"
          >
            Security Scanners
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[45rem] flex-1 flex-col justify-center px-4 py-12 sm:px-6">
        <div className="space-y-8">
          <div className="space-y-3">
            <h1 className="flex items-center gap-3 text-3xl leading-[1.1] font-medium tracking-[-0.025em] text-foreground sm:text-4xl">
              <ShieldAlert
                aria-hidden="true"
                className="size-6 shrink-0 text-caution"
                strokeWidth={1.75}
              />
              <span>Page or scanning feature not found</span>
            </h1>
            <p className="max-w-[58ch] text-base leading-relaxed text-muted-foreground">
              The route you requested does not match an active Vanguard AV page
              or scanning capability. Choose one of the six live scanners below
              or return to the homepage.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/features"
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-on-primary motion-safe:transition-colors motion-safe:duration-150 hover:bg-primary-hover active:bg-primary-pressed"
            >
              <span>Open Security Scanners</span>
              <ArrowRight aria-hidden="true" className="size-4" strokeWidth={1.75} />
            </Link>
            <Link
              href="/"
              className="inline-flex min-h-11 items-center rounded-lg border border-border-control bg-canvas px-4 text-sm font-medium text-foreground motion-safe:transition-colors motion-safe:duration-150 hover:bg-surface-hover"
            >
              Return to homepage
            </Link>
          </div>

          <div className="space-y-2 border-t border-outline pt-6">
            <h2 className="text-xs font-medium text-muted-foreground">
              Available live scanners ({FEATURE_CATALOG.length})
            </h2>
            <ul className="divide-y divide-outline border-y border-outline">
              {FEATURE_CATALOG.map((feature) => (
                <li key={feature.slug}>
                  <Link
                    href={feature.route}
                    className="group flex min-h-11 items-center justify-between gap-3 px-2 py-3 text-sm font-medium text-foreground motion-safe:transition-colors motion-safe:duration-150 hover:bg-surface"
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <FeatureIcon
                        iconKey={feature.iconKey}
                        className="size-4 shrink-0 text-accent"
                      />
                      <span className="truncate group-hover:text-accent">{feature.name}</span>
                    </span>
                    <ArrowRight
                      aria-hidden="true"
                      className="size-4 shrink-0 text-muted-foreground group-hover:text-accent"
                      strokeWidth={1.75}
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </main>
    </div>
  );
}
