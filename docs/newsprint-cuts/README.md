# Cuts (title images)

Drop a file in `web/public/newsprint/cuts/` and the engraving slot renders it
instead of the placeholder. Nothing else to change — no data-model field, no
upload step.

**Only the day's lead article has a slot.** Every other story — the story rows,
the second-tier columns, the reader page of a non-lead article — is set in type
alone, and a file dropped for one of them will never be shown. The rule lives in
the `Cut` component's header comment (`web/src/components/newsprint/chrome.tsx`)
and there are exactly three `<Cut>` call sites, all lead-only:
`NewsprintFrontPage.tsx`, `NewsprintBroadsheet.tsx` (inside `LeadStory`), and
`NewsprintArticleViewer.tsx` (guarded by `isLead`). So a day needs at most one
image, named for whichever article the desk led with.

These notes live here rather than beside the images: everything under
`web/public/` is served verbatim, so a README next to the cuts was published
at `https://<도메인>/newsprint/cuts/README.md` — internal working notes, and
the prompt rules with them, readable by anyone who guessed the path.

## Naming

    <article-id>.png

e.g. `article-2026-07-13-1.png`

The article id is on the article row in `web/src/lib/data/seed/articles.json`,
and in the review console it is the `#N` rank of the edition being desked:
`article-<edition date>-<pipeline rank>`.

Keyed on the id rather than the slug or the display rank on purpose — ids are
derived from the PIPELINE rank and stay stable when the desk reorders the
front page or re-publishes. A slug moves with the headline; a display rank
moves with the desk's decisions.

## What the image must be

- **1950s black-and-white engraving tone, line art.** See PROMPTS.md for the
  style block. The component applies a grayscale filter, but ship it already
  toned — a colour photo desaturated still reads as a photo, and a halftone
  screen reads as a photograph of an event that never happened.
- **No depiction of the event, and no real person.** Illustrate the place, the
  object, or the subject matter instead. An AI image of a real event is a
  fabricated record, and images read as evidence in a way prose does not.
- **No logos, no flags, no brand marks** — trademark, and the paper carries no
  insignia.
- Some leads should carry no cut at all. A mass-casualty story is one: drawing
  the fire fabricates the scene, drawing the street reads as indifference.
  Leave the file out and the slot falls back to its labelled placeholder — a
  ruled box printing the slot's own label (`ENGRAVING / 820×1080 / 대표 삽화`
  on the front page, and the equivalent on the other two surfaces), not empty
  space. So "no cut" is a visible decision on the page, not an invisible one.
  A broken or missing file lands in the same place: the `<img>` `onError`
  handler falls back to the placeholder rather than a broken-image icon.

## Sizes

The lead's one image is reused in all three lead surfaces, each of which asks
for a different aspect. Three slots, one file:

| Slot | Where | Intended |
|---|---|---|
| Reader hero | `NewsprintArticleViewer.tsx` (lead only) | 1200 x 880 |
| Front page hero (mobile) | `NewsprintFrontPage.tsx` | 820 x 1080 |
| Broadsheet centre | `NewsprintBroadsheet.tsx` `LeadStory` | 1000 x 1300 |

The slot crops to fill (`object-fit: cover`), so anything in roughly the right
aspect works — but note the same file is cropped three ways, so keep the subject
away from the edges.

There is no second-tier slot. An earlier draft of this file listed a
"Second-tier cut" at 620 x 520; no such slot was ever built, and `StoryRow.tsx`
explicitly dropped the handoff's 84px row cut for the same reason ("every row
here would have printed an empty frame").

## Status

This is a staging arrangement, not the finished pipeline. Nothing here checks
that an image belongs to its article, and nothing generates the prompts — both
belong in the pipeline once the flow is settled.
