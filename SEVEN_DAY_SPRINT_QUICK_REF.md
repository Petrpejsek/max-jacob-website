# Quick Reference: 4-Step Sprint Structure

## New Data Structure

Each step object now has:
```javascript
{
  day: 1,              // or '2–4' (can be string or number)
  title: 'Step Name',
  promise: 'What you get',
  deliverables: [
    'Deliverable 1',
    'Deliverable 2'
  ]
}
```

## The 4 Steps

### 1. Diagnose + Plan (Day 1)
**Promise:** You get a clear plan + priorities
- Identified blockers (dynamic based on audit)
- Confirm goals, service area, and lead definition

### 2. Build the Lead Magnet (Days 2–4)
**Promise:** New above-the-fold + CTA flow (call/text/book)
- Rewrite headline/subhead for instant clarity
- Define dominant CTA strategy

### 3. Tracking + Follow-up (Days 4–6)
**Promise:** Calls/forms tracked + instant response so leads don't go cold
- Set up tracking + auto-replies
- Add Local SEO fundamentals (NAP + LocalBusiness schema)

### 4. QA + Launch + Handoff (Day 7)
**Promise:** Launch + simple handoff doc
- Cross-device QA, speed checks, and go-live
- Handoff doc with change log + backlog

## UI Elements

**Chips (below headline):**
- ✅ No meetings (green)
- ⚡ 7 days (blue)
- 🎯 Fixed scope (purple)

**Card Structure:**
```
[Large Day Number]  [Title - Bold 2xl]
                    [Promise - Italic, semibold]
                    • Deliverable 1
                    • Deliverable 2
```

## Dynamic Content

These fields are personalized per audit:
- `${city}` - Client's city
- `${niche}` - Client's service type
- `whatWeFixLine` - Top 2 detected issues
- `ctaLine` - Primary CTA from website
- `seoLine` - SEO/schema gaps detected

## Backward Compatibility

The template still supports old `detail` format:
```javascript
// Old format (still works)
{ day: 1, title: 'Step', detail: 'Long paragraph...' }

// New format (preferred)
{ day: 1, title: 'Step', promise: 'Promise', deliverables: [...] }
```

## Files Changed

1. `server/helpers/auditViewModelV2.js` - Data generation
2. `server/views/audit-public-v2.ejs` - Template rendering
