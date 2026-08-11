## How to build with Newsboy

Newsboy is the design system of an English-learning news reader: a Korean UI wrapped around English article text. Its whole look comes from **CSS custom properties defined on `:root`** — there is no Tailwind, no CSS-in-JS, and no theme provider.

### Setup — no wrapper, one stylesheet

Components take no context. There is no provider to wrap anything in: render `<Newsboy.ArticleCard article={…} />` directly and it is fully styled.

The one hard requirement is that **`styles.css` is loaded**. It defines every `--*` token below and `@import`s `_ds_bundle.css` (the `.briefly-*` classes) plus the two webfonts. Without it every component renders as unstyled inline-style boxes in the browser's default font.

**Theme** is an attribute on the root element, not a prop:

```html
<html data-theme="dark">   <!-- or data-theme="light"; omit to follow the OS -->
```

Every token has a dark value, so switching that one attribute reskins the entire system. Never hardcode a hex colour — a dark-mode regression is the guaranteed result.

### The styling idiom: inline `style` with `var(--token)`

This is the single most important thing to copy. Newsboy components style themselves with React inline `style` objects whose **values are token references**, e.g. `padding: "var(--sp-4)"`. They accept `style` and `className` and merge them, so your own layout glue should be written the same way. Do not invent utility class names — none exist.

The full token vocabulary, all defined in `styles.css`:

| Group | Tokens |
|---|---|
| Surface & line | `--color-bg` `--color-surface` `--color-surface-alt` `--color-border` `--color-border-strong` |
| Text | `--color-text` `--color-text-secondary` `--color-text-muted` `--color-text-invert` |
| Brand & state | `--color-accent` `--color-accent-hover` `--color-accent-soft` `--color-link` `--color-link-hover` `--color-success` `--color-danger` `--color-focus-ring` |
| CEFR level | `--level-a2-bg/-fg` `--level-b1-bg/-fg` `--level-b2-bg/-fg` `--level-orig-bg/-fg` |
| Category | `--cat-world` `--cat-korea` `--cat-ai` `--cat-tech` `--cat-business` `--cat-finance` `--cat-science` `--cat-sports` `--cat-culture` `--cat-lifestyle` |
| Font family | `--font-en` (Lora serif — **English article text only**) `--font-ui` (Pretendard — all Korean and UI) `--font-mono` (pronunciation) |
| Size / leading | `--fs-display` `--fs-h1` `--fs-h2` `--fs-h3` `--fs-body` `--fs-ui` `--fs-sm` `--fs-xs`, each with a matching `--lh-*` |
| Spacing (4px grid) | `--sp-1` `--sp-2` `--sp-3` `--sp-4` `--sp-5` `--sp-6` `--sp-8` `--sp-10` `--sp-12` |
| Radius | `--r-sm` `--r-md` `--r-lg` `--r-pill` |
| Shadow | `--shadow-card` `--shadow-pop` `--shadow-sticky` |
| Motion | `--ease` `--dur-fast` `--dur-base` `--dur-slow` |
| Layout | `--content-max` (680px reading measure) `--page-max` `--header-h` `--tabbar-h` `--reading-scale` |

Two rules the system never breaks:

- **Serif is for English, sans is for Korean.** English article titles and bodies use `--font-en`; every Korean label, button and meta line uses `--font-ui`. Mixing them up is the fastest way to make a screen look wrong.
- **Colour is never the only signal.** Level badges always print "A2"/"B1"/"B2", category tags always carry an emoji and a text label, the source badge always says "소스 N". Accessibility spec, not decoration.

### The `.briefly-*` classes

A small set of real class names carries what inline styles can't express — hover, keyframes, media queries, pseudo-elements. Pass them via `className`; they are defined in `_ds_bundle.css`:

`.briefly-article-card` `.briefly-article-body` `.briefly-sentence` `.briefly-word` `.briefly-word-ruby` `.briefly-skeleton` `.briefly-sources` `.briefly-sheet` `.briefly-dim` `.briefly-hscroll` `.briefly-tabbar` `.briefly-sidenav` `.briefly-header-logo` `.briefly-shell-desktop` `.briefly-shell-main` `.briefly-shell-content`

The responsive nav rule matters when you lay out an app: `.briefly-sidenav` is hidden below 1024px and `.briefly-tabbar` is hidden at 1024px and up. Use `AppShell` and you get both for free.

### Where the truth lives

Read the bound `styles.css` and its `@import` closure (it pulls in `_ds_bundle.css`) before styling anything — that closure is the authoritative token list and carries the dark-theme block. Per component, read `<Name>.prompt.md` for usage and `<Name>.d.ts` for the exact props.

### An idiomatic snippet

```jsx
<div style={{
  display: "flex", flexDirection: "column", gap: "var(--sp-3)",
  maxWidth: "var(--content-max)", padding: "var(--sp-4)",
  background: "var(--color-bg)",
}}>
  <h2 style={{
    fontFamily: "var(--font-ui)", fontSize: "var(--fs-h2)",
    lineHeight: "var(--lh-h2)", color: "var(--color-text)", margin: 0,
  }}>
    오늘의 브리핑
  </h2>

  <ArticleCard article={article} />

  <Button variant="primary">읽기 시작</Button>
</div>
```

The library component carries the control; the surrounding layout is your own, written in the same token idiom.
