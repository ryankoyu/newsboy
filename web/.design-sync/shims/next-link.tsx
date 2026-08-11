// design-sync shim for `next/link`.
// Preview cards render outside a Next.js app, so the real Link (which needs the
// App Router context) throws. A plain <a> is visually identical and keeps every
// styling prop the components pass through.
import type { AnchorHTMLAttributes, ReactNode } from "react";

interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string | { pathname?: string };
  children?: ReactNode;
  prefetch?: boolean;
  replace?: boolean;
  scroll?: boolean;
  shallow?: boolean;
  passHref?: boolean;
  legacyBehavior?: boolean;
}

export default function Link({
  href,
  children,
  // Next-only props — swallowed so React doesn't warn about unknown DOM attrs.
  prefetch: _prefetch,
  replace: _replace,
  scroll: _scroll,
  shallow: _shallow,
  passHref: _passHref,
  legacyBehavior: _legacyBehavior,
  onClick,
  ...rest
}: LinkProps) {
  const url = typeof href === "string" ? href : (href?.pathname ?? "#");
  return (
    <a
      href={url}
      onClick={(e) => {
        // Previews are static — never navigate the card's iframe away.
        e.preventDefault();
        onClick?.(e);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}
