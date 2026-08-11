# design-sync notes — Newsboy

Repo-specific gotchas for future syncs. Read this before re-running.

## Shape

This is a **Next.js app**, not a published component library — there is no
`dist/`, no `.d.ts` tree, and `package.json` has no `exports`. The converter
runs in **synth-entry mode**: it builds an entry that `export *`s every file
under `cfg.srcDir` (`src/components`).

- `--entry ./src/.no-dist` is **deliberate and must be passed**. The file does
  not exist; its only job is to make the converter resolve `PKG_DIR` by walking
  up to `web/package.json`. Without `--entry`, `PKG_DIR` becomes
  `node_modules/web`, which doesn't exist, and the build exits. The
  `[NO_DIST] --entry ./src/.no-dist doesn't exist` line in the log is expected.
- `cfg.pkg` is `"web"` (the real package name). `cfg.globalName` is pinned to
  `"Newsboy"` because `web` is on the converter's generic-name list.

Full command:

```sh
node .ds-sync/package-build.mjs --config .design-sync/config.json \
  --node-modules ./node_modules --entry ./src/.no-dist --out ./ds-bundle
node .ds-sync/package-validate.mjs ./ds-bundle
```

Run from `web/`, not the repo root.

## Next.js has to be shimmed out

15 components import `next/link` or `next/navigation`. Both need the App Router
context and throw (or drag 190+ `next/dist` modules and a bare `process`
reference) into a standalone bundle. `.design-sync/tsconfig.ds.json` remaps them
to `.design-sync/shims/`, which is what keeps `_ds_bundle.js` at ~160 KB with
zero inlined externals. If a future component imports another `next/*` module
(`next/image`, `next/font`), add a shim and a `paths` entry the same way.

Two traps in that tsconfig, both of which silently disable the whole plugin or
misresolve, and both of which cost a debugging cycle here:

- **No comments of any kind.** The converter strips `/* */` non-greedily and
  strips `//` line comments; a `"//"` documentation key gets mangled and
  `JSON.parse` fails, and the plugin then returns `null` *without an error* —
  esbuild silently falls back to the app's own `tsconfig.json`, which resolves
  `@/` but not the shims. Symptom: `grep -c next/dist ds-bundle/_ds_bundle.js`
  is non-zero and every preview throws `ReferenceError: process is not defined`.
- **`"@/lib/data"` must be listed before `"@/*"`.** The paths plugin checks
  `existsSync` with an empty extension first, so the wildcard rule resolves
  `@/lib/data` to the *directory* and esbuild fails with
  `Cannot read file "src/lib/data": is a directory`. The explicit entry pointing
  at `index.ts` comes first and wins.

## Stylesheet

`src/app/globals.css` can't ship as-is (`@import "tailwindcss"`, `@theme inline`,
and `--font-lora` injected at runtime by `next/font`).
`.design-sync/styles/prepare-css.mjs` copies it verbatim minus those two
Tailwind directives, prepends remote `@import`s for Lora and Pretendard, defines
`--font-lora`, and appends the one Tailwind utility the components use
(`.sr-only`). Output lands in the gitignored `.design-sync/.cache/newsboy.css`.

**Run `cfg.buildCmd` (`node .design-sync/styles/prepare-css.mjs`) before every
converter run** — the cache is gitignored, so a fresh clone has no stylesheet
and the build ships an empty `_ds_bundle.css`.

Tailwind is never invoked. That is only safe because the components style
themselves with inline `style` + `var(--token)`; `sr-only` is the sole utility
class in the whole component tree. If someone starts using Tailwind utilities in
components, this shortcut breaks and the CSS must be compiled for real.

## Previews

- Fixtures live in `.design-sync/fixtures/`. `seed.ts` repeats
  `src/lib/data/seed-provider.ts`'s joins **synchronously** (the real provider is
  `async` even though every method is a pure lookup, and a promise racing the
  screenshot is not worth the flake). No invented content — everything comes
  from `src/lib/data/seed/*.json`.
- **Session isolation is mandatory.** Every card is its own page but they share
  one origin, so `localStorage` carries between cards and capture order silently
  changes what renders. `MyView` seeds a populated account; every other preview
  whose component reads the session calls `resetSession()` at module scope.
  Symptom of getting this wrong: `OnboardingBanner` renders empty because
  `MyView` dismissed the banner earlier in the same capture run.
  Session-reading components: ArticleBody, ArticleCard, ArticleViewer,
  ArticleViewerBar, BriefCompleteCard, FontSizePopover, GreetingBlock, HomeView,
  MyView, OnboardingBanner, OnboardingFlow, SettingsView, SmartDictionary,
  ThemeToggle (plus AppShell, which composes HomeView).
- Viewport overrides are load-bearing for the nav components:
  `.briefly-sidenav` is `display:none` below 1024px and `.briefly-tabbar` is
  hidden at 1024px and up. `SideNav` is pinned to 1200px, `TabBar` to 420px,
  `AppShell` to 1200px. Without them SideNav captures completely blank.

## Known render warns (expected — not new)

- `[FONT_REMOTE] "Pretendard", "Inter", "Lora", "IBM Plex Mono"` — by design.
  Both real families load from the same CDN URLs the app itself uses
  (jsdelivr for Pretendard, Google Fonts for Lora). Nothing is bundled.
- `[RENDER_BLANK] components/general/TabBar/TabBar.html … PNG is ~4.6KB` — the
  card is genuinely short (a 60px bar at 420px wide). It is not blank; see the
  app bug below for why it also looks wrong.

## App defect surfaced by this sync (NOT fixed)

`.briefly-tabbar` in `src/app/globals.css` is only ever given `display: none`
(at ≥1024px). It is never given `display: flex`, so on mobile the `<nav>` is a
block box and its three `<a>` children — each `flex: 1` with
`flexDirection: column` — stack **vertically** and overflow the 60px bar
instead of sitting side by side. This is an app bug, not a preview bug; the
catalog shows it faithfully on purpose. One-line fix when the owner wants it:
add `display: flex;` to the `.briefly-tabbar` rule.

## States that cannot render statically (deliberately skipped)

- `FontSizePopover` — the S/M/L/XL panel only opens on click.
- `OnboardingFlow` steps 2 and 3 — behind the "다음" button. That is also the
  only place `sampleArticle` is used, so a `sampleArticle={null}` cell would be
  pixel-identical; it was dropped rather than shipped as a duplicate variant.
- Card hover / active transforms (`.briefly-article-card:hover`).

## Re-sync risks

- **`buildCmd` output is gitignored.** `.design-sync/.cache/newsboy.css` must be
  regenerated first or the sync ships an unstyled bundle. This is the single
  most likely way a future re-sync silently degrades.
- **`prepare-css.mjs` strips by pattern.** It matches `@import "tailwindcss";`
  and `@theme inline { … }` with a brace-free body. If `globals.css` gains a
  nested `@theme` block or switches to `@config`/`@plugin`, the strip stops
  matching and Tailwind at-rules leak into the shipped CSS. Diff the generated
  file after any large `globals.css` change.
- **Shims drift.** `.design-sync/shims/next-navigation.tsx` implements the hooks
  the components use today (`usePathname`, `useRouter`, plus `useSearchParams`
  and `useParams` for headroom). A newly imported hook resolves to `undefined`
  and the preview throws "not a function".
- **Seed data is the only content source.** If `src/lib/data/seed/*.json` is
  replaced by a live Supabase provider, `fixtures/seed.ts` keeps reading the JSON
  files — it will still build, just against stale content. Re-point it then.
- **Toolchain**: node v25, playwright chromium-headless-shell build 1234 in
  `~/Library/Caches/ms-playwright`. Converter deps are installed into the
  gitignored `.ds-sync/`; a fresh clone must re-copy the staged scripts and
  re-run `npm i esbuild ts-morph @types/react playwright` there.
- Fonts are fetched from the network at render time, so a fully offline capture
  falls back to system fonts and every screenshot changes.
