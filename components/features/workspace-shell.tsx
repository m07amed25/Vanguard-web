"use client";

import { ChevronDown, Menu, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dialog, VisuallyHidden } from "radix-ui";
import type { ReactNode } from "react";
import {
  FEATURE_BY_SLUG,
  FEATURE_DOMAIN_GROUPS,
} from "@/lib/features/catalog";
import type { FeatureSlug } from "@/lib/features/types";
import { FeatureIcon } from "./feature-icon";
import { useReadiness } from "./workspace-provider";

function CompactReadinessCue({ slug }: { slug: FeatureSlug }) {
  const { snapshot, isInitialLoading } = useReadiness();

  if (isInitialLoading) {
    return (
      <span className="inline-flex shrink-0 items-center">
        <span
          aria-hidden="true"
          className="size-1.5 rounded-full border border-info bg-info/40 motion-safe:animate-pulse forced-colors:border-[CanvasText]"
        />
        <span className="sr-only">Checking</span>
      </span>
    );
  }

  const ready = snapshot.features[slug]?.ready ?? false;
  if (ready) {
    return (
      <span className="inline-flex shrink-0 items-center">
        <span
          aria-hidden="true"
          className="size-1.5 rounded-full border border-transparent bg-positive forced-colors:border-[CanvasText]"
        />
        <span className="sr-only">Ready</span>
      </span>
    );
  }

  return (
    <span className="inline-flex shrink-0 items-center">
      <span
        aria-hidden="true"
        className="size-1.5 rotate-45 border border-transparent bg-caution forced-colors:border-[CanvasText]"
      />
      <span className="sr-only">Unavailable</span>
    </span>
  );
}

function NavigationItems({
  pathname,
  closeOnNavigate = false,
}: {
  pathname: string;
  closeOnNavigate?: boolean;
}) {
  const { snapshot, isInitialLoading } = useReadiness();
  const isOverview = pathname === "/features";

  const overviewLink = (
    <Link
      href="/features"
      aria-current={isOverview ? "page" : undefined}
      className={`flex min-h-11 items-center justify-between gap-2 rounded-lg px-3 text-sm motion-safe:transition-colors motion-safe:duration-150 ${
        isOverview
          ? "workspace-nav-active bg-surface-selected font-medium text-foreground"
          : "font-normal text-muted-foreground hover:bg-surface hover:text-foreground"
      }`}
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <FeatureIcon
          iconKey="overview"
          className={`size-4 shrink-0 ${isOverview ? "text-accent" : ""}`}
        />
        <span className="truncate">All Scanners</span>
      </span>
      <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
        {isInitialLoading
          ? "…"
          : `${snapshot.readyCount}/${snapshot.totalCount}`}
      </span>
    </Link>
  );

  return (
    <div className="space-y-6">
      <div>
        {closeOnNavigate ? (
          <Dialog.Close asChild>{overviewLink}</Dialog.Close>
        ) : (
          overviewLink
        )}
      </div>

      {FEATURE_DOMAIN_GROUPS.map((group) => (
        <div key={group.category} className="space-y-1">
          <p className="px-3 pb-0.5 text-xs font-medium text-muted-foreground">
            {group.category}
          </p>
          <ul className="space-y-0.5">
            {group.slugs.map((slug) => {
              const feature = FEATURE_BY_SLUG[slug];
              const isActive = pathname === feature.route;

              const itemLink = (
                <Link
                  href={feature.route}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex min-h-11 items-center justify-between gap-2 rounded-lg px-3 text-sm motion-safe:transition-colors motion-safe:duration-150 ${
                    isActive
                      ? "workspace-nav-active bg-surface-selected font-medium text-foreground"
                      : "font-normal text-muted-foreground hover:bg-surface hover:text-foreground"
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <FeatureIcon
                      iconKey={feature.iconKey}
                      className={`size-4 shrink-0 ${isActive ? "text-accent" : ""}`}
                    />
                    <span className="truncate">{feature.shortLabel}</span>
                  </span>
                  <CompactReadinessCue slug={feature.slug} />
                </Link>
              );

              return (
                <li key={feature.slug}>
                  {closeOnNavigate ? (
                    <Dialog.Close asChild>{itemLink}</Dialog.Close>
                  ) : (
                    itemLink
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function WorkspaceShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/features";

  return (
    <div className="relative isolate flex min-h-svh flex-col bg-canvas text-foreground lg:flex-row">
      <a
        href="#features-main"
        className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50 focus:inline-flex focus:min-h-11 focus:items-center focus:rounded-lg focus:border focus:border-accent focus:bg-surface-raised focus:px-4 focus:text-sm focus:font-semibold focus:text-accent"
      >
        Skip to scanner workspace
      </a>

      {/* Desktop persistent left navigation rail */}
      <aside
        aria-label="Workspace navigation"
        className="hidden lg:sticky lg:top-0 lg:flex lg:h-svh lg:w-[15rem] lg:shrink-0 lg:flex-col lg:border-e lg:border-outline lg:bg-canvas"
      >
        <div className="flex min-h-16 items-center border-b border-outline px-4">
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
        </div>

        <nav
          aria-label="Security scanners"
          data-lenis-prevent
          className="workspace-scroll flex-1 overflow-y-auto px-3 py-5"
        >
          <NavigationItems pathname={pathname} />
        </nav>

        <div className="border-t border-outline px-4 py-3 text-xs text-muted-foreground">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <Link
              href="/"
              className="inline-flex min-h-11 items-center underline-offset-4 hover:text-foreground hover:underline"
            >
              Home
            </Link>
            <Link
              href="/#contact"
              className="inline-flex min-h-11 items-center underline-offset-4 hover:text-foreground hover:underline"
            >
              Contact
            </Link>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Static-only · Zero retention
          </p>
        </div>
      </aside>

      {/* Mobile / Tablet sticky header + accessible Radix Dialog drawer */}
      <header className="workspace-mobile-header sticky top-0 z-40 border-b border-outline bg-canvas/95 backdrop-blur-xs lg:hidden">
        <div className="flex min-h-14 items-center justify-between gap-3 px-4">
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
              className="h-7 w-auto"
              priority
            />
          </Link>

          <Dialog.Root>
            <Dialog.Trigger asChild>
              <button
                type="button"
                aria-label="Open workspace navigation"
                className="workspace-menu-trigger inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-border-control bg-surface px-3 text-sm font-medium text-foreground motion-safe:transition-colors motion-safe:duration-150 hover:bg-surface-hover active:bg-surface-selected"
              >
                <Menu aria-hidden="true" className="size-4" strokeWidth={1.75} />
                <span>Menu</span>
              </button>
            </Dialog.Trigger>

            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-50 bg-black/65" />
              <Dialog.Content
                aria-describedby={undefined}
                data-lenis-prevent
                className="workspace-scroll fixed inset-y-0 start-0 z-50 flex w-[min(18rem,calc(100vw-2rem))] flex-col border-e border-border-control bg-canvas shadow-[0_16px_48px_rgb(0_0_0/50%)] focus:outline-none"
              >
                <VisuallyHidden.Root>
                  <Dialog.Title>Security scanners navigation</Dialog.Title>
                </VisuallyHidden.Root>

                <div className="flex min-h-14 items-center justify-between border-b border-outline px-4">
                  <Dialog.Close asChild>
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
                        className="h-7 w-auto"
                      />
                    </Link>
                  </Dialog.Close>

                  <Dialog.Close asChild>
                    <button
                      type="button"
                      aria-label="Close workspace navigation"
                      className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-lg border border-border-control bg-canvas text-foreground hover:bg-surface-hover"
                    >
                      <X aria-hidden="true" className="size-4" strokeWidth={1.75} />
                    </button>
                  </Dialog.Close>
                </div>

                <nav
                  aria-label="Security scanners"
                  data-lenis-prevent
                  className="workspace-scroll flex-1 overflow-y-auto px-3 py-4"
                >
                  <NavigationItems pathname={pathname} closeOnNavigate />
                </nav>

                <div className="border-t border-outline px-4 py-3 text-xs text-muted-foreground">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <Dialog.Close asChild>
                      <Link
                        href="/"
                        className="inline-flex min-h-11 items-center underline-offset-4 hover:text-foreground hover:underline"
                      >
                        Home
                      </Link>
                    </Dialog.Close>
                    <Dialog.Close asChild>
                      <Link
                        href="/#contact"
                        className="inline-flex min-h-11 items-center underline-offset-4 hover:text-foreground hover:underline"
                      >
                        Contact
                      </Link>
                    </Dialog.Close>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Static-only · Zero retention
                  </p>
                </div>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>

        {/* Full-width stacked no-script navigation fallback below header row */}
        <noscript>
          <details className="border-t border-outline px-4 py-2">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-sm font-medium text-foreground">
              <span>Scanners &amp; navigation</span>
              <ChevronDown
                aria-hidden="true"
                className="size-4 text-muted-foreground"
                strokeWidth={1.75}
              />
            </summary>
            <nav aria-label="Security scanners fallback" className="space-y-3 pb-3 pt-2">
              <div>
                <Link
                  href="/features"
                  className="flex min-h-11 items-center rounded-lg px-2 text-sm font-medium text-accent underline underline-offset-4"
                >
                  All Scanners
                </Link>
              </div>
              {FEATURE_DOMAIN_GROUPS.map((group) => (
                <div key={group.category} className="space-y-1">
                  <p className="px-2 text-xs font-semibold text-muted-foreground">
                    {group.category}
                  </p>
                  <ul className="space-y-0.5">
                    {group.slugs.map((slug) => {
                      const feature = FEATURE_BY_SLUG[slug];
                      return (
                        <li key={feature.slug}>
                          <Link
                            href={feature.route}
                            className="flex min-h-11 items-center rounded-lg px-2 text-sm text-foreground hover:bg-surface-hover"
                          >
                            {feature.name}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
              <div className="flex flex-wrap gap-4 border-t border-outline pt-2 text-xs text-muted-foreground">
                <Link href="/" className="inline-flex min-h-11 items-center underline">
                  Home
                </Link>
                <Link
                  href="/#contact"
                  className="inline-flex min-h-11 items-center underline"
                >
                  Contact
                </Link>
              </div>
            </nav>
          </details>
        </noscript>
      </header>

      {/* Main content area + mobile footer */}
      <div className="flex min-w-0 flex-1 flex-col">
        <main
          id="features-main"
          tabIndex={-1}
          className="flex-1 outline-none"
        >
          <div className="mx-auto w-full max-w-[60rem] px-4 py-8 sm:px-6 sm:py-10 lg:px-10">
            {children}
          </div>
        </main>

        <footer className="border-t border-outline bg-canvas px-4 py-4 text-xs text-muted-foreground lg:hidden">
          <div className="mx-auto flex w-full max-w-[60rem] flex-wrap items-center justify-between gap-3">
            <p>Static-only · Zero retention</p>
            <div className="flex items-center gap-4">
              <Link
                href="/"
                className="inline-flex min-h-11 items-center underline-offset-4 hover:text-foreground hover:underline"
              >
                Home
              </Link>
              <Link
                href="/#contact"
                className="inline-flex min-h-11 items-center underline-offset-4 hover:text-foreground hover:underline"
              >
                Contact
              </Link>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
