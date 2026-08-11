# Cuts (title images)

Drop a file here and the article's engraving slot renders it instead of the
placeholder. Nothing else to change — no data-model field, no upload step.

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
- Some stories should carry no cut at all. A mass-casualty story is one:
  drawing the fire fabricates the scene, drawing the street reads as
  indifference. Leave the file out and the slot falls back to its placeholder.

## Sizes

| Slot | Intended |
|---|---|
| Reader hero | 1200 x 880 |
| Front page hero (mobile) | 820 x 1080 |
| Broadsheet centre | 1000 x 1300 |
| Second-tier cut | 620 x 520 |

The slot crops to fill, so anything in roughly the right aspect works.

## Status

This is a staging arrangement, not the finished pipeline. Nothing here checks
that an image belongs to its article, and nothing generates the prompts — both
belong in the pipeline once the flow is settled.
