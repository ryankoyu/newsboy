// design-sync shim for `next/navigation`.
// The real hooks read the App Router context, which doesn't exist in a preview
// card, so they throw. These stand-ins return inert values: navigation is a
// no-op and the pathname is "/" (home), which is also what makes the nav
// components render their default active state.

const noop = () => {};

export function usePathname(): string {
  return "/";
}

export function useSearchParams(): URLSearchParams {
  return new URLSearchParams();
}

export function useParams(): Record<string, string> {
  return {};
}

export interface AppRouterInstance {
  push: (href: string) => void;
  replace: (href: string) => void;
  back: () => void;
  forward: () => void;
  refresh: () => void;
  prefetch: (href: string) => void;
}

export function useRouter(): AppRouterInstance {
  return {
    push: noop,
    replace: noop,
    back: noop,
    forward: noop,
    refresh: noop,
    prefetch: noop,
  };
}

export function redirect(_href: string): never {
  throw new Error("[design-sync shim] redirect() is not available in previews");
}

export function notFound(): never {
  throw new Error("[design-sync shim] notFound() is not available in previews");
}
