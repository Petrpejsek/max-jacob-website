# Visual Layout Guide: Two Founders Promise Section

## Desktop Layout (> 1024px)

```
┌────────────────────────────────────────────────────────────────────────┐
│                    BLUE SECTION (bg-blue-600)                          │
│                                                                         │
│  ┌──────────────────────┐  ┌──────────────────────────────────────┐  │
│  │  LEFT COLUMN         │  │  RIGHT COLUMN                        │  │
│  │  (Photos)            │  │  (Content)                           │  │
│  │                      │  │                                      │  │
│  │  ┌────┐  ┌────┐     │  │  Real help. Two founders.            │  │
│  │  │Max │  │Jacob│     │  │  No agency runaround.                │  │
│  │  │176│  │176 │     │  │                                      │  │
│  │  │px │  │px  │     │  │  We reviewed your site and found...  │  │
│  │  └────┘  └────┘     │  │                                      │  │
│  │   Max     Jacob      │  │  ✓ Build mobile-first lead magnet   │  │
│  │  Strategy Design     │  │  ✓ Fix trust + conversion flow       │  │
│  │                      │  │  ✓ Make it AI/GEO-ready             │  │
│  │                      │  │                                      │  │
│  │                      │  │  Short form → build → approve...     │  │
│  │                      │  │                                      │  │
│  │                      │  │  — Max & Jacob (founders)            │  │
│  │                      │  │                                      │  │
│  │                      │  │  ┌──────────────┐ ┌──────────────┐  │  │
│  │                      │  │  │Get Free Plan │ │See Preview   │  │  │
│  │                      │  │  └──────────────┘ └──────────────┘  │  │
│  └──────────────────────┘  └──────────────────────────────────────┘  │
│         40% width                      60% width                      │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Tablet Layout (768px - 1024px)

```
┌───────────────────────────────────────────────────┐
│        BLUE SECTION (stacked columns)             │
│                                                   │
│  ┌────────────────────────────────────────────┐  │
│  │  PHOTOS (centered)                         │  │
│  │                                            │  │
│  │     ┌────┐  ┌────┐                        │  │
│  │     │Max │  │Jacob│                       │  │
│  │     │176│  │176 │                        │  │
│  │     │px │  │px  │                        │  │
│  │     └────┘  └────┘                        │  │
│  │      Max     Jacob                         │  │
│  │     Strategy Design                        │  │
│  └────────────────────────────────────────────┘  │
│                                                   │
│  ┌────────────────────────────────────────────┐  │
│  │  CONTENT (centered)                        │  │
│  │                                            │  │
│  │  Real help. Two founders.                  │  │
│  │  No agency runaround.                      │  │
│  │                                            │  │
│  │  We reviewed your site and found...        │  │
│  │                                            │  │
│  │  ✓ Build mobile-first lead magnet          │  │
│  │  ✓ Fix trust + conversion flow             │  │
│  │  ✓ Make it AI/GEO-ready                    │  │
│  │                                            │  │
│  │  Short form → build → approve...           │  │
│  │                                            │  │
│  │  — Max & Jacob (founders)                  │  │
│  │                                            │  │
│  │  ┌──────────────┐ ┌──────────────┐        │  │
│  │  │Get Free Plan │ │See Preview   │        │  │
│  │  └──────────────┘ └──────────────┘        │  │
│  └────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────┘
```

---

## Mobile Layout (< 640px)

```
┌──────────────────────────────┐
│    BLUE SECTION (mobile)     │
│                              │
│  ┌─────────┐  ┌─────────┐   │
│  │  Max    │  │ Jacob   │   │
│  │  112px  │  │ 112px   │   │
│  │         │  │         │   │
│  └─────────┘  └─────────┘   │
│      Max         Jacob       │
│    Strategy     Design       │
│                              │
│  Real help. Two founders.    │
│  No agency runaround.        │
│                              │
│  We reviewed your site       │
│  and found the few           │
│  changes...                  │
│                              │
│  ✓ Build mobile-first        │
│    lead magnet               │
│                              │
│  ✓ Fix trust + conversion    │
│    flow above the fold       │
│                              │
│  ✓ Make it AI/GEO-ready      │
│    so Google + AI can...     │
│                              │
│  Short form → we build       │
│  → you approve → launch.     │
│  No meetings needed.         │
│                              │
│  — Max & Jacob (founders)    │
│                              │
│  ┌──────────────────────┐   │
│  │  Get My Free Plan    │   │
│  └──────────────────────┘   │
│                              │
│  ┌──────────────────────┐   │
│  │  See Preview Example │   │
│  └──────────────────────┘   │
│                              │
└──────────────────────────────┘
```

---

## Spacing & Measurements

### Container
- Max width: `7xl` (80rem / 1280px)
- Padding: `px-6` (24px sides)
- Blue box: `rounded-[4rem]` (64px border radius)

### Inner Grid
- Max width: `6xl` (72rem / 1152px)
- Gap between columns: `gap-10 lg:gap-16` (40px mobile, 64px desktop)
- Padding: `p-8 md:p-12` (32px mobile, 48px desktop)

### Photos
- Border: `border-4 border-white` (4px white)
- Shadow: `shadow-2xl`
- Border radius: `rounded-3xl` (24px)
- Sizes:
  - Mobile: `w-28 h-28` (112px)
  - Small: `sm:w-36 sm:h-36` (144px)
  - Medium+: `md:w-44 md:h-44` (176px)

### Text Spacing
- Headline margin: `mb-6` (24px)
- Intro margin: `mb-6` (24px)
- Bullets margin: `mb-6` (24px)
- Bullet spacing: `space-y-3` (12px between)
- Process margin: `mb-6` (24px)
- Signature margin: `mb-6` (24px)

### Buttons
- Padding: `px-8 py-4` (32px horizontal, 16px vertical)
- Border radius: `rounded-[1.5rem]` (24px)
- Gap between: `gap-4` (16px)
- Font size: `text-base md:text-lg` (16px → 18px)

---

## Color Palette

### Background
- Section: `bg-blue-600` (#2563EB)
- Primary CTA: `bg-white` (white)
- Secondary CTA: `bg-white/10` (white 10% opacity)

### Text
- Headline: `text-white` (white)
- Intro: `text-blue-50` (#EFF6FF)
- Bullets: `text-blue-50` (#EFF6FF)
- Process: `text-blue-100` (#DBEAFE)
- Signature: `text-blue-200` (#BFDBFE)
- Role labels: `text-blue-200` (#BFDBFE)

### CTAs
- Primary text: `text-blue-600` (#2563EB)
- Primary hover: `hover:bg-blue-50` (#EFF6FF)
- Secondary text: `text-white` (white)
- Secondary border: `border-white/30` (white 30% opacity)
- Secondary hover: `hover:bg-white/20` (white 20% opacity)

---

## Responsive Breakpoints

```
Mobile:    0px - 640px   (w-28, 1 column, stacked CTAs)
Small:     640px - 768px (sm:w-36, 1 column, stacked CTAs)
Medium:    768px - 1024px (md:w-44, 1 column, horizontal CTAs)
Large:     1024px+        (lg: 2 columns, horizontal CTAs)
```

---

## Interactive States

### Photos
- Hover: `group-hover:scale-[1.02]` (2% scale up)
- Transition: `transition-transform`

### Primary CTA
- Hover: `hover:bg-blue-50` + `hover:scale-105` (5% larger)
- Active: `active:scale-95` (pressed effect)
- Shadow: `shadow-xl`

### Secondary CTA
- Hover: `hover:bg-white/20` (brightness increase)
- Border: `border-2 border-white/30`

---

## Typography

### Font Weights
- Headlines: `font-black` (900)
- Body: `font-medium` (500)
- Process: `font-bold` (700)
- Names: `font-black` (900)
- Roles: `font-bold` (700)

### Font Sizes
```
Headline:  text-3xl md:text-4xl (30px → 36px)
Intro:     text-base md:text-lg (16px → 18px)
Bullets:   text-sm md:text-base (14px → 16px)
Process:   text-sm md:text-base (14px → 16px)
Signature: text-xs md:text-sm (12px → 14px)
Names:     text-base md:text-lg (16px → 18px)
Roles:     text-[9px] md:text-[10px] (9px → 10px)
CTAs:      text-base md:text-lg (16px → 18px)
```

---

## Accessibility

### Contrast
- White on blue-600: AAA (excellent)
- Blue-50 on blue-600: AA (good)
- Blue-100 on blue-600: AA (good)
- Blue-600 on white: AAA (excellent)

### Focus States
All interactive elements have focus styles via Tailwind defaults

### Semantic HTML
- `<section>` for main container
- `<h3>` for headline
- `<ul>` + `<li>` for bullets
- `<a>` for CTAs (proper links)

---

## Performance Notes

- Image optimization: Ensure team photos are optimized
- Loading: Photos should have `loading="lazy"` if below fold
- Animation: Transform-only animations (GPU accelerated)
- Grid: CSS Grid (well-supported, performant)

---

**Ready for production!** 🚀
