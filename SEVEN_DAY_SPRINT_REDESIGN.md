# 7-Day Sprint Redesign - Complete

## Summary

Successfully redesigned the "7-Day Sprint" section from 7 steps to 4 steps with cleaner, more concise presentation.

## Changes Made

### A) Reduced from 7 steps to 4 steps

**Before:** 7 individual days with detailed paragraphs
**After:** 4 consolidated phases with clear structure

#### New 4-Step Structure:

1. **Diagnose + Plan** (Day 1)
   - Promise: "You get a clear plan + priorities"
   - 2 deliverables (prioritized blockers + goals confirmation)

2. **Build the Lead Magnet** (Days 2–4)
   - Promise: "New above-the-fold + CTA flow (call/text/book)"
   - 2 deliverables (headline rewrite + CTA strategy)

3. **Tracking + Follow-up** (Days 4–6)
   - Promise: "Calls/forms tracked + instant response so leads don't go cold"
   - 2 deliverables (tracking setup + SEO/GEO/AI improvements)
   - Note: SEO/GEO/AI consolidated as 1 bullet here (not a separate step)

4. **QA + Launch + Handoff** (Day 7)
   - Promise: "Launch + simple handoff doc"
   - 2 deliverables (QA/go-live + handoff documentation)

### B) New Format: Title + Promise + 2 Deliverables

Each step now follows this clean structure:
```
Step Title
One-line promise (what it means for them)
• Deliverable 1
• Deliverable 2
```

**Before:** Mini-paragraphs with lots of detail
**After:** Scannable bullets with key outcomes

### C) Added "No meetings" UI chips

Added prominent badge/chip section under the headline:
- ✅ No meetings (green)
- ⚡ 7 days (blue)
- 🎯 Fixed scope (purple)

These chips make the value props immediately visible.

### D) Removed overly specific details

**Removed:**
- "15–20 min kickoff" → Too specific, not general enough
- Phone numbers like "(407) 743-1980" → Too specific to Orlando example
- City references like "(Orlando)" → Kept general

**Kept:**
- Dynamic city/niche variables that personalize to each audit
- General promises and outcomes

## Files Modified

1. **server/helpers/auditViewModelV2.js**
   - Updated `buildSevenDayPlan()` function
   - Removed `phone` variable (no longer needed)
   - Simplified `seoLine` to be more concise
   - Changed structure from `{day, title, detail}` to `{day, title, promise, deliverables[]}`
   - Reduced from 7 objects to 4 objects in return array

2. **server/views/audit-public-v2.ejs**
   - Added chips/badges section with 3 value props
   - Updated template to render `promise` field (italic, semibold)
   - Updated template to render `deliverables` array as bullet list
   - Kept backward compatibility with `detail` field for old audits
   - Updated day label rendering to handle string days like "2–4"

## Testing

✅ JavaScript syntax validated (no errors)
✅ Backward compatibility maintained (still supports old `detail` format)
✅ Visual hierarchy improved (title → promise → bullets)

## Design Benefits

1. **Less fatigue:** 4 steps feel more manageable than 7
2. **Clearer structure:** Each step has exactly 2 deliverables (consistent)
3. **Better scanning:** Bullets are easier to skim than paragraphs
4. **Stronger promises:** The "what you get" line makes value immediate
5. **More visible value props:** Chips make "No meetings" prominent
6. **Still feels complete:** Process is clear without being overwhelming

## Next Steps

No additional changes needed. The redesign is complete and ready for production.

To see the changes in action:
1. Start the server: `npm start`
2. Navigate to any audit public page
3. Scroll to "The 7-Day Sprint" section
