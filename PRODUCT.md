# Product

## Register

brand

## Users

High-net-worth individuals, family offices, and design-literate professionals evaluating Vaultstone as a credible custodian of significant wealth. They arrive after a referral, a press mention, or a deliberate search. They are reading the site like one reads a private bank's lobby — looking for signals of permanence, discretion, and competence, not for promotional copy. They have already seen every Chase, HSBC, and Revolut landing and are tired of them.

## Product Purpose

Vaultstone Bank is a modern private bank for clients who treat their relationship with money as long-term. The landing exists primarily to establish brand impression — to make a sophisticated visitor pause and feel that Vaultstone belongs in the small set of institutions they would trust. Conversion (open-account, consultation booking) is secondary; perceived prestige and craft are primary. If the visitor leaves remembering one image, one phrase, and one feeling of weight, the page has succeeded.

## Brand Personality

Three words: **architectural, monumental, considered.**

Voice: confident, sparse, declarative. No marketing adjectives ("seamless", "powerful", "next-gen"). Sentences end early. Numbers are exact. Claims are testable. The brand sounds like a quiet expert, not a salesperson.

Emotional goal: when a visitor scrolls the page, the experience should feel like walking into a vaulted stone hall — wide, deliberate, with each element placed on purpose. Tech precision (Stripe / Linear) gives it credibility; editorial structure (Monocle / FT Weekend) gives it intelligence; heritage cinematography (Patek Philippe / Loro Piana) gives it weight.

## Anti-references

- **Big-4 retail banks** (Chase, Wells Fargo, HSBC corporate): smiling-couple stock photography, generic blue gradients, "your goals" copy. Vaultstone does not chase. Reject this entirely.
- **Navy-and-gold fintech cliché** (the current Vaultstone site, plus every "premium" challenger bank): dark navy + gold accent + Inter + animated particle hero. First-order training-data reflex for "premium banking". The redesign must escape this lane.
- **Hero-metric SaaS template**: big number + small label + 4-up identical card grid + CTA-on-gradient. Reads as a B2B tool, not an institution.
- **Crypto / neon-on-black**: bro-finance signaling. Wrong audience, wrong tier.
- **Generic luxury cliché** (gold foil on black, marble background photos, "exclusive" copy): performative wealth signaling. Vaultstone implies wealth, never advertises it.

## Design Principles

1. **Permanence over polish.** The page should feel built to outlast trends, not styled for this quarter. Prefer typographic weight, ample whitespace, and deliberate silence over decorative effects.
2. **Editorial over marketing.** Structure the page like a magazine feature, not a product page. Long-form moments, generous lead-ins, considered captions. The reader is intelligent; don't sell, present.
3. **Type as architecture.** Typography carries scale, hierarchy, and emotional weight. A monumental headline replaces a hero illustration. Body copy is set at readable measure; display copy is set at unapologetic scale.
4. **Restraint signals confidence.** Every word, image, and motion must earn its place. If a section can be cut without loss, cut it. Empty space is a luxury signal.
5. **Motion as punctuation.** Kinetic typographic moments and scroll-driven reveals are allowed and welcomed, but only at deliberate beats. Motion that decorates is removed; motion that frames meaning is kept. Always provide a static `prefers-reduced-motion` fallback.

## Accessibility & Inclusion

- WCAG 2.1 AA conformance across color contrast, focus visibility, keyboard navigation, and semantic markup.
- `prefers-reduced-motion` must collapse kinetic typography and scroll animations into static, in-place renders without loss of information.
- Body copy capped at 65–75ch for readability across breakpoints.
- All decorative SVG marked `aria-hidden`; all interactive icons paired with text labels.
- Color choices verified against 4.5:1 for body text and 3:1 for large display text in both light and dark contexts before shipping.
