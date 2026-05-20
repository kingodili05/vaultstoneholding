# Design

Visual system for Vaultstone Bank's brand surfaces (landing pages, marketing, long-form content). The product surfaces (dashboard, admin) follow their own product-register conventions documented elsewhere.

This file describes a deliberate departure from the previous Vaultstone aesthetic — dark navy + gold accent + Inter — which PRODUCT.md classifies as the first-order training-data reflex for "premium banking" and an anti-reference.

## Visual Theme

**Light, warm, architectural.** The page reads like sunlit limestone, not like a vault. Ample whitespace acts as a luxury signal. Typography carries scale, weight, and hierarchy in place of decorative elements. One pigment — a deep terracotta — appears at <8% of any surface as a punctuation mark, never as an atmosphere.

The design rejects: dark navy, metallic gold, particle hero canvases, custom cursors, animated gradient backgrounds, glassmorphism, hero-metric four-up card grids, identical icon-above-heading feature cards, side-stripe accent borders, modal-first interaction patterns, and the editorial-typographic SaaS lane (Klim-influenced Cormorant-italic + mono labels).

## Color

OKLCH throughout. Neutrals tinted toward the warm-stone hue (chroma ~0.012, hue ~75). Never `#fff` or `#000`.

```css
:root {
  /* Surface scale — warm limestone */
  --stone-50:  oklch(98.5% 0.008 78);   /* page wash */
  --stone-100: oklch(96%   0.012 75);   /* default background */
  --stone-200: oklch(92%   0.014 72);   /* alt surface */
  --stone-300: oklch(85%   0.016 70);   /* hairline rules, dividers */
  --stone-500: oklch(58%   0.014 70);   /* secondary text, captions */
  --stone-700: oklch(34%   0.012 70);   /* body text on light */
  --stone-900: oklch(18%   0.010 75);   /* primary text — ink */

  /* Pigment — terracotta. <8% of surface. */
  --terra:     oklch(48% 0.13 40);
  --terra-ink: oklch(32% 0.11 38);      /* hover, focus */

  /* Functional */
  --focus-ring: oklch(48% 0.13 40 / 0.45);
  --selection:  oklch(48% 0.13 40 / 0.18);
}
```

**Strategy: Committed.** The warm stone IS the brand surface, not the absence of color. Terracotta carries weight as a single committed accent — borders on key headlines, the kinetic underline, hover state on links, the section index numerals. No other accent colors. No gradients. No tinted overlays.

**Color usage rules**
- Headlines and body text: `--stone-900` on `--stone-100`. Contrast 13.5:1 — well above AA.
- Captions and metadata: `--stone-500`. Contrast 5.1:1.
- Hairline rules: `--stone-300`, always exactly 1px.
- Terracotta appears in: section-index numerals (`01 / Vaultstone`), the hero kinetic underline, link hover, focus rings, the count-up numerals during their animation only (they settle back to ink).
- No `#000` (oklch 0% 0 0) anywhere. No `#fff` (oklch 100% 0 0) anywhere.

## Typography

Two families, both Google Fonts, both off the reflex-reject list.

- **Display: Bricolage Grotesque** (variable, 200–800, optical sizes). Used for hero, section titles, monumental numerals. Loaded with `font-feature-settings: "ss01", "ss02"` for sharper terminals; tight `font-stretch` at large sizes via the variable axis. Architectural posture, not editorial.
- **Body: Geist Sans** (Vercel, free, 100–900 weights). Used for body copy, captions, navigation, buttons. Geist is mechanical-precise without reading as a developer-tool default; pairs cleanly with Bricolage's structural display weight.

No italic for display (Bricolage italic is not used in this system — kept upright for monumental posture). No condensed body sans. No third family. No icon fonts — SVG only.

### Scale (fluid `clamp()`, ratio ≥1.33)

```css
--type-caption:  clamp(12px, 0.75vw + 9px, 14px);   /* tracked uppercase metadata */
--type-body:     clamp(16px, 0.4vw + 14px, 18px);   /* default body */
--type-lead:     clamp(20px, 0.6vw + 17px, 26px);   /* lead paragraphs */
--type-h3:       clamp(28px, 1.5vw + 22px, 40px);
--type-h2:       clamp(44px, 3.0vw + 30px, 80px);
--type-h1:       clamp(64px, 7.5vw + 24px, 200px); /* hero, monumental */
--type-numeral:  clamp(88px, 10vw + 32px, 280px);  /* count-up display numerals */
```

Headings use Bricolage at weight 500–700 with `letter-spacing: -0.02em` at display sizes (tightens to -0.04em past 120px). Body Geist at 400, line-height 1.55 for body / 1.05 for display.

Body measure capped at 65ch. Lead paragraphs capped at 52ch. Section captions capped at 38ch.

### Voice

- Display headlines: declarative, period-terminated, never marketing-adjective laden.
- Body copy: short clauses, exact numbers, no hedge words.
- Section indices: numeric `01 — 07`, never word-spelled.
- All-caps reserved for short tracked-letterspaced labels at `--type-caption` size (e.g., "INVESTOR RELATIONS"). Never for body or sub-headlines.

## Spacing & Layout

12-column grid, 24px gutter, 88px outer page padding on desktop (`clamp(20px, 4vw, 96px)` fluid). Grid lines are visible as 1px `--stone-300` hairlines at section edges — the structure shows, brutalist-luxury.

Vertical rhythm: sections separated by `clamp(96px, 14vh, 220px)` of empty space. **No section is shorter than its breathing room.** Equal padding everywhere is the cliché; rhythm comes from variance.

```css
--space-1: 4px;    /* hairline gaps */
--space-2: 8px;
--space-3: 16px;
--space-4: 24px;   /* base */
--space-5: 40px;
--space-6: 64px;
--space-7: 96px;
--space-8: 144px;
--space-9: 220px;  /* monumental */
```

No containers wrapping containers. Maximum nesting is 2. The default outer width is 100vw with `padding-inline: clamp(20px, 4vw, 96px)`; the inner grid uses CSS Grid with named lines (`[full-start] minmax(0, 1fr) [content-start] ... [content-end] minmax(0, 1fr) [full-end]`) so full-bleed elements are one declaration, not a structural restructure.

### Asymmetry

Asymmetric column placement is the default. Headlines anchor to columns 1–8; captions to columns 9–12. Numbers section places its long-form paragraph in columns 2–9, with section index in column 1. The hero word "outlast" occupies columns 4–12 by itself. Don't center-stack.

## Components

Few, intentional, no nesting.

### Hairline rule

The single most-used element. 1px `--stone-300`, used to separate sections, columns of metadata, and editorial blocks. **Never** as a side-stripe (the absolute ban). Always horizontal or vertical full-line.

### Section index

Format: `01 / Vaultstone` or `02 — Numbers`. Caption size, tracked `letter-spacing: 0.16em`, uppercase. Numeral in `--terra`, slash + label in `--stone-700`. Appears once at the top of every major section.

### Editorial block (replaces "card")

A left-aligned text block — eyebrow caption, headline, lead paragraph, optional inline list. **No background, no border, no shadow, no radius.** Separated from siblings by a hairline rule above (full-bleed) and `--space-7` below. This replaces every `.feature-card`, `.product-card`, `.glass-card`, and `.testimonial-card` from the previous design.

### Inline list

When a list is needed (e.g., wealth account features), set as a comma-separated inline sentence rather than a bulleted column. Example: *"Dedicated private banker, alternative assets, estate planning, concierge across tiers."* If a bulleted list is genuinely necessary, use a hanging hyphen — never a colored checkmark icon.

### Quiet button

Two variants only:
- **Primary** — `--stone-900` text on `--stone-100` background, 1px solid `--stone-900` border, no fill, no shadow. On hover, fills with `--stone-900` and inverts text to `--stone-100`, 220ms ease-out-quart.
- **Ghost** — same construction without border; text underlined on hover with `--terra` 1px underline that animates in from left at 280ms.

Heights: 44px small, 56px default, 72px large. Border-radius: 0. Buttons sit on the baseline grid; they don't float.

### Number sentence

Replaces the four-up stats grid entirely. A single prose paragraph with numerals set in Bricolage at `--type-numeral` size, inline with the surrounding sentence. The numerals count up on scroll-into-view in `--terra`, settling to `--stone-900` once complete. One sentence: *"Forty-eight billion under management. Two-point-four million clients. Twenty-five years of compounding discipline."*

### Caption

`Geist` 400 at `--type-caption`, `--stone-500`, tracked +0.08em when uppercase. Used for image alts, legal disclosures, regulatory tags.

## Motion

Three deliberate beats. No fourth.

1. **Hero entrance** — per-word fade-in of the hero headline, 80ms stagger between words, exponential-out curve (`cubic-bezier(0.16, 1, 0.3, 1)`), 800ms total duration. The terracotta underline beneath "outlast" draws left-to-right after the last word lands, 540ms.
2. **Number sentence count-up** — when the numbers section crosses 30% viewport, each numeral counts up from 0 to its target over 1400ms with exponential-out easing. Numerals are terracotta during the count, settling to ink in the last 200ms.
3. **Section reveal** — the hairline rule at the top of each section draws across the viewport from left to right when the section header crosses 25% viewport, 720ms, exponential-out.

```css
--ease-out-quart: cubic-bezier(0.165, 0.84, 0.44, 1);
--ease-out-expo:  cubic-bezier(0.16, 1, 0.3, 1);
--dur-fast:   220ms;
--dur-base:   480ms;
--dur-slow:   720ms;
--dur-hero:   800ms;
```

**Reduced-motion fallback** — `@media (prefers-reduced-motion: reduce)` collapses all three: hero headline renders in place at final state; count-up numerals render as their final value; section rules render fully drawn. No fade-in either; the page is fully painted on load. This is mandatory, not optional.

Hover states animate background and color but **never** layout properties (`width`, `height`, `top`, `left`, `margin`, `padding`). Transform-only.

## Imagery

V1 ships **without photographs**. The architectural-typographic register carries the page entirely. CSS-rendered surfaces — the hairline grid, the monumental numerals, deliberate negative space — are the imagery.

Photographs may be added in V2 from Unsplash, verified IDs only, used at full-bleed scale at deliberate beats (after the hero, after the offerings, in the security section). Subjects: architectural stone detail, sun-lit office interior, hand-bound ledger detail. No people, no smiling-couple stock photography (anti-reference), no globe-with-network-overlay finance iconography.

## Forbidden

In addition to the impeccable absolute bans:

- Inter font family (anywhere on a brand surface; product surfaces are exempt).
- Custom cursors.
- `<canvas>` particle backgrounds.
- Glassmorphic cards (`backdrop-filter: blur` on a tinted surface).
- Gold (`#C9A84C` or any oklch variant near hue 85, chroma > 0.08).
- Dark mode on brand surfaces (the scene sentence forces light).
- Four-up icon-headline-paragraph card grids.
- "Most Popular" badges.
- Star rating SVGs in testimonials.
- Carousels (testimonial slider is removed; one quoted client at most, set as a single editorial block).
- Trust-badge logo strips ("As featured in...").
- Em dashes in any copy. Use commas, periods, parentheses, or set in two sentences.
