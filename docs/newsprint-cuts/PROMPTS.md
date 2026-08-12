# Cut prompts

Prompts for generating the engraving that fills the lead's slot. Paste one
into an image model, tone the result black-and-white, save it as
`<article-id>.png` in `web/public/newsprint/cuts/`.

Only the day's lead article has a slot — one image per edition, not ten. See
README.md ("Only the day's lead article has a slot") before generating a set.

Kept in the repo rather than in chat so the style block and the rules stay
with the images they govern — but outside `web/public/`, which is served to
the open internet as-is. See README.md next to this file.

---

## Style block

Append to every prompt.

```
1950s newspaper illustration, black and white engraving tone, scraperboard
line art, fine crosshatch and stipple shading, high contrast, printed on
newsprint, flat even lighting, no text, no lettering, no signage, no people,
no logos, no color.
```

**Line art, not halftone.** A 1950s paper reproduced photographs as a coarse
halftone screen, and that is the one period look to avoid: a halftone of an
AI-generated scene reads as a photograph of an event that did not happen.
Scraperboard and line engraving read as drawings, which is what they are.

**Note on period.** The page itself is set as a 1902 broadsheet. A 1950s cut
is half a century adrift from its own paper — both are monochrome
old-newspaper tone so it reads acceptably, but if the mismatch shows, the
choice is to move the cuts back to 1902 wood engraving or move the whole skin
forward. Deliberate, not an oversight.

---

## Rules these prompts follow

1. **Never depict the event.** The story happened; an image model's version of
   it did not. A picture of a thing that did not occur is a fabricated record,
   and images are read as evidence in a way prose is not.
2. **Never depict a real person.** Likeness, and it implies a photograph of
   them at that moment.
3. **Illustrate the place, the object, or the subject matter** instead. This is
   how papers used engravings before wire photos.
4. **No logos, flags, or brand marks** — trademark, and the paper carries no
   insignia.
5. **Some leads take no cut.** Leave the file out and the slot falls back to
   its labelled placeholder. (Non-lead stories have no slot at all, so there is
   nothing to leave out for them.)
6. **The caption names the picture. It does not claim anything about the
   event.**

---

## Written for the 2026-07-13 edition

Each entry: the prompt subject, then its caption.

These ten were drafted when the design still assumed a cut per story. Only the
lead has a slot now, so on any given day exactly one of these is the one that
prints — the rest are kept as worked examples of the style and of the "no cut"
judgement (see #9), not as a set to generate.

### 1. US lawmaker detained in the West Bank
> Terraced olive groves on a dry limestone hillside, low stone retaining walls,
> a narrow unpaved track winding between them, distant hills under a pale sky.

Caption: `Terraced hillsides of the southern West Bank.`

### 2. Senator Lindsey Graham dies at 71
> The dome of a neoclassical legislative capitol seen from below, ribbed
> cast-iron ribs, lantern and statue at the crown, bare winter branches at the
> frame edge.

Caption: `The Capitol, Washington.`

### 3. McConnell explains a fall and pneumonia
> A single empty high-backed leather armchair at a wooden desk in a panelled
> chamber, papers squared on the blotter, tall window light from the left.

Caption: `A senator's desk.`

### 4. Chip exports surge
> A stack of shipping containers beside gantry cranes at a container terminal,
> straight lines of rail, harbour water in the foreground.

Caption: `The container terminal at Busan.`

### 5. Kospi enters a bear market
> A large standing bear rendered as a heraldic engraving, three-quarter view,
> heavy fur texture, plain ground line, no background.

Caption: `The bear.`

### 6. EU warns Meta over addictive design
> A long ribbon of paper unspooling from a drum and coiling endlessly across a
> table, the coil receding out of frame.

Caption: `Without end.`

### 7. China recovers a rocket booster at sea
> A tall cylindrical rocket booster suspended above a broad net rigged between
> four masts on a flat sea barge, calm ocean, technical draughtsman's view.

Caption: `Recovery at sea.`

### 8. Fashion brand x baseball club
> A worn baseball, a leather fielding glove and a wooden bat arranged on a
> plain plank surface, still-life composition.

Caption: `The season's equipment.`

### 9. Bangkok pub fire, 27 dead
**No cut.** Drawing the fire fabricates the scene; drawing the street reads as
indifference. Papers often run a mass-casualty story in type alone. Leave the
slot empty and let the headline carry it.

### 10. US strikes Iran, Strait of Hormuz
> An engraved nautical chart of a narrow sea strait between two coastlines,
> depth soundings, compass rose, hatched shorelines, shipping lane dashes.

Caption: `The Strait of Hormuz.`
