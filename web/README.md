# web — Newsboy reader and desk

The reader app (Korean UI around English article text at A2/B1/B2) and the
desk console the editor reviews an edition in before it goes out.

Content comes from `pipeline/`, which is a separate package in this
repository. See the root `README.md` for how the two fit together.

**Before writing code here, read [`AGENTS.md`](./AGENTS.md).** This is
Next.js 16 with Turbopack, and it differs from older Next.js in ways that
matter; the authoritative guides are in `node_modules/next/dist/docs/`.

## Running it

```bash
npm install
npm run dev          # http://localhost:3000
```

The reader works with no environment at all — it reads the seed JSON in
`src/lib/data/seed/`, which is committed. The desk console needs
`web/.env.local`; `.env.example` lists every variable and what happens when
one is missing.

```bash
npm test             # vitest
npm run build        # production build
npm run lint
```

## What is where

| Path | |
|---|---|
| `src/app/` | routes — reader pages, plus `admin/` for the desk |
| `src/components/newsprint/` | the 1902 broadsheet skin |
| `src/components/` | the standard skin, shared controls |
| `src/lib/data/` | the data provider and the committed seed |
| `src/lib/admin/` | desk logic — gate badges, approval, publish |
| `src/lib/session.ts` | reader state, in localStorage |

## Two skins, and which one you are looking at

`useNewsprintSkin` returns `!isDark`: **light mode is the newsprint skin**,
and the standard components are the dark-mode fallback. Most readers are on
the default, so a feature that exists only in the standard components does
not exist for them. When you change one skin, check the other.

## Where the reader's data lives

Everything a reader accumulates — level, bookmarks, read articles, saved
words and sentences — is one localStorage key, with no server copy. Settings
can export and re-import it. Clearing site data still loses it.

## The desk console is local-only

It reads the JSON the pipeline leaves in `pipeline/output/`, so it cannot
work on a deployment that has no such directory (Vercel, for one). Every
`/admin` page checks for it and explains itself rather than erroring. Moving
the desk onto Supabase is the open piece of work.
