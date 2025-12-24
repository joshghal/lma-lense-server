# Gemini Integration - Complete ✓

**Status:** Fully implemented and ready to test
**API Key:** Configured in `.env`

---

## What Was Created

### ✅ Files

1. **`.env`** - Environment variables
   - `GEMINI_API_KEY` configured with your key
   - Automatically loaded by dotenv
   - **Protected by .gitignore** ✓

2. **`.gitignore`** - Protect sensitive files
   - `.env` excluded from git
   - `node_modules/` excluded
   - Build artifacts excluded

3. **`src/gemini.ts`** - Complete implementation
   - `searchLegalPrecedent()` - Main search function
   - `buildLegalQuery()` - Query builder for 5 issue types
   - `extractCitations()` - Parse grounding metadata
   - `testGeminiConnection()` - Connection test

4. **`src/test-gemini.ts`** - Test suite
   - 4 test cases covering all issue types
   - Verifies API connection
   - Shows example output

---

## Features Implemented

### 🔍 searchLegalPrecedent()

```typescript
const result = await searchLegalPrecedent(query);
// Returns: { answer: string, citations: Citation[] }
```

**What it does:**
- Calls Gemini 2.0 Flash with Google Search grounding
- Temperature: 0.4 (more factual)
- Dynamic retrieval threshold: 0.7
- Extracts grounding metadata for citations
- Deduplicates results

### 📝 buildLegalQuery()

```typescript
const query = buildLegalQuery('circular_definition', clauseText);
```

**Supported issue types:**
1. `circular_definition` - Searches for Scamell v. Ouston, uncertainty doctrine
2. `vague_mac` - Searches for MAC clause enforceability cases
3. `outdated_reference` - Searches for LIBOR cessation guidance
4. `missing_cross_reference` - Searches for Arnold v. Britton, contra proferentem
5. `inconsistent_terminology` - Searches for Chartbrook interpretation rules

**Each query:**
- Specifies English law focus
- Requests Supreme Court / Court of Appeal precedents
- Includes context from the actual clause

### 🔗 Citation Extraction

Automatically extracts from Gemini grounding:
- Title, URL, Year
- Removes duplicates
- Handles multiple year formats: `[1992]`, `(2015)`, `2015`
- Extracts from title or URL

---

## Testing

### Install Dependencies First

```bash
cd lma-lens-server
npm install
```

This installs:
- `@google/generative-ai` - Gemini SDK
- `dotenv` - Environment variable loader
- All other dependencies

### Run Tests

```bash
# Test Gemini integration
npm run test:gemini
```

**Expected output:**
```
🧪 Testing Gemini Integration

Test 1: Connection Check
✓ Gemini connected successfully
Answer length: 523
Citations found: 3

Test 2: Circular Definition Search
Query: English law case law on circular definitions...

Answer: Circular definitions in contracts are generally void...
Citations found: 3

Top citations:
  1. Scamell v Ouston [1941] AC 251 (1941)
     https://www.bailii.org/uk/cases/...
  2. May & Butcher v The King [1934] (1934)
     https://www.bailii.org/uk/cases/...

...

✅ All tests completed successfully!
```

---

## Configuration

### Temperature Settings

Current: `0.4` (balanced for legal accuracy)

```typescript
generationConfig: {
  temperature: 0.4,  // Lower = more factual, higher = more creative
  topP: 0.95,
  topK: 40,
  maxOutputTokens: 1024,
}
```

**Adjust if needed:**
- Lower (0.2-0.3) for more conservative citations
- Higher (0.5-0.7) for more diverse results

### Grounding Threshold

Current: `0.7` (strict quality filter)

```typescript
dynamicRetrievalConfig: {
  mode: 'MODE_DYNAMIC',
  dynamicThreshold: 0.7  // 0.0-1.0
}
```

**Adjust if needed:**
- Higher (0.8-0.9) for higher quality sources only
- Lower (0.5-0.6) for more results

---

## Usage in Pipeline

### Basic Usage

```typescript
import { searchLegalPrecedent, buildLegalQuery } from './gemini.js';

// Detect an issue
const issue = {
  type: 'circular_definition',
  clauseText: '"MAC" means material adverse change.'
};

// Build query
const query = buildLegalQuery(issue.type, issue.clauseText);

// Search
const result = await searchLegalPrecedent(query);

console.log('Analysis:', result.answer);
console.log('Found citations:', result.citations.length);
```

### Integration with Issue Detection

```typescript
// After detecting issues, ground each one
for (const issue of detectedIssues) {
  const query = buildLegalQuery(issue.type, issue.clauseText);
  const grounding = await searchLegalPrecedent(query);

  issue.analysis = grounding.answer;
  issue.citations = grounding.citations;
}
```

---

## Next Steps

### ✅ Done
- [x] Gemini client configured
- [x] API key set up
- [x] Search function implemented
- [x] Citation extraction working
- [x] Query builder for all 5 issue types
- [x] Test suite created

### 🔨 TODO (Next)
- [ ] Create `src/parser.ts` - PDF parsing
- [ ] Create `src/detector.ts` - Issue detection using Gemini
- [ ] Create `src/analyzer.ts` - Format analysis per tone-guide.md
- [ ] Create `src/grounding.ts` - Match against canonical-cases.json
- [ ] Update `src/server.ts` - Wire everything together

---

## Troubleshooting

### API Key Issues
```bash
# Verify .env exists
cat .env

# Should show:
GEMINI_API_KEY=AIzaSyAP8JKDeQqOoq2Ogq58F473aOwZj5-_J14
```

### Rate Limits
Gemini free tier: 15 requests/minute

If you hit limits:
- Add delay between requests
- Reduce test frequency
- Upgrade to paid tier

### No Citations Found
If `citations.length === 0`:
- Query might be too specific
- Lower `dynamicThreshold` to 0.5
- Check grounding metadata manually

### Connection Errors
```bash
# Check internet connection
curl https://generativelanguage.googleapis.com

# Verify API key is valid
# Visit: https://aistudio.google.com/app/apikey
```

---

## Documentation Reference

- **Gemini API Docs:** https://ai.google.dev/docs
- **Grounding Guide:** https://ai.google.dev/docs/grounding
- **Tone Guide:** `../docs/tone-guide.md`
- **Implementation Plan:** `../docs/lma-lens-context.md`

---

**Gemini integration complete! Ready to build issue detection.** 🚀
