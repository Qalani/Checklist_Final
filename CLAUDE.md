# Zen Workspace — Claude Context

## Design Context

### Users
Zen Workspace serves a broad audience: knowledge workers, students, creatives, personal life organizers, and small collaborative teams. Users come to it during focused work sessions, daily planning, and life management. The common thread: they want to feel in control and at ease, not overwhelmed. The interface should reduce cognitive load and create space for clear thinking.

### Brand Personality
**Calm · Clear · Composed**

The interface should feel like a well-organized desk in a quiet room — every element purposeful, nothing superfluous. Voice is understated: confident without boasting, helpful without being chatty. Users should feel focused, uncluttered, and gently capable — not impressed by the UI, but *at home in it*.

Zen Workspace does not reference other apps. It should feel distinctly its own.

### Aesthetic Direction
- **Visual tone:** Minimal and refined. Generous whitespace. Soft, diffuse shadows. Rounded corners throughout (rounded-xl / rounded-2xl). No sharp rectangles, no harsh drop shadows, no aggressive gradients.
- **Color:** The "Solace" palette — cool sky neutrals (Zen), tranquil teal (Sage), soft lavender (Warm). Four themes: Zen Light (default), Dawn Light, Midnight Dark, Forest Dark. Saturated color used sparingly — only for primary CTAs and key accents.
- **Typography:** Inter. Headings are semibold at modest sizes. Secondary text fades with reduced opacity rather than smaller size alone.
- **Depth:** Glassmorphism for overlays/sticky elements (`bg-surface/80 backdrop-blur-2xl`). Shadow scale: soft → medium → lift.
- **Motion:** Subtle and composed. Fade/slide-up/scale-in at 0.2–0.4s. Never decorative — only to confirm state changes or guide attention. Always respect `prefers-reduced-motion`.
- **Anti-patterns:** No cluttered layouts, gamification, neon accents, heavy shadows, or enterprise-dashboard energy.

### Design Principles
1. **Compose, don't crowd.** Every element earns its place. Prefer whitespace over density.
2. **Color with restraint.** Sage for primary actions, Warm for secondary accents, Zen neutrals carry the rest. Don't introduce new colors without system-level justification.
3. **Consistency over cleverness.** Reuse established patterns. Predictability is a feature.
4. **Motion serves meaning.** Animate only when it helps users understand what changed or where to look.
5. **Accessible by default.** WCAG AA minimum. Keyboard navigation always functional. Never convey meaning through color alone.
