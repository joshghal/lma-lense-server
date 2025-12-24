# LMA Lens Server

**MCP Server for contract intelligence**

## Structure

```
lma-lens-server/
├── src/
│   ├── server.ts         # MCP entry point (basic skeleton)
│   └── types.ts          # Shared TypeScript types
├── data/
│   └── canonical-cases.json  # 18 verified English law precedents
├── package.json
├── tsconfig.json
└── README.md
```

## Setup

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build
npm start
```

## What's Implemented

✅ **Basic MCP server skeleton**
- Server setup with @modelcontextprotocol/sdk
- Single tool: `analyze_contract`
- Accepts filepath input
- Returns JSON result

✅ **Type definitions**
- `CaseLaw`, `Clause`, `Issue`, `GroundedIssue`
- `Citation`, `AnalysisResult`
- 5 issue types defined

✅ **Data**
- 18 canonical cases from curated-cases.md
- Valid JSON format
- Ready to import

## What's NOT Implemented (TODO)

You need to build:

1. **PDF Parsing** (`src/parser.ts`)
   - Install: `pdf-parse`
   - Extract text from PDF
   - Split into clauses

2. **Issue Detection** (`src/detector.ts`)
   - AI-based detection using Gemini
   - 5 issue types: circular_definition, vague_mac, outdated_reference, etc.
   - Return Issue[] array

3. **Gemini Integration** (`src/gemini.ts`)
   - Install: `@google/generative-ai`
   - Configure with API key
   - Search for legal precedent
   - Extract citations from grounding metadata

4. **Issue Analysis** (`src/analyzer.ts`)
   - Generate concise analysis (3-5 sentences)
   - Follow tone-guide.md rules
   - Always cite case law

5. **Grounding Logic** (`src/grounding.ts`)
   - Load canonical-cases.json
   - Check if Gemini citations match canonical
   - Return enhanced citations

## Next Steps

**Week 1 (Days 1-7): Build the Server**

1. **Day 1-2:** Gemini integration + test queries
2. **Day 3-4:** PDF parsing + clause extraction
3. **Day 5-6:** Issue detection (AI-based)
4. **Day 7:** Full integration + testing

See `../docs/lma-lens-context.md` for detailed implementation plan.

## Environment Variables

Create `.env`:
```bash
GEMINI_API_KEY=your_key_here
```

## Testing

```bash
# Once implemented, test with:
npm run dev

# Then in Claude Desktop, call:
analyze_contract --filepath /path/to/contract.pdf
```

## Reference Docs

- Main context: `../docs/lma-lens-context.md`
- Tone guide: `../docs/tone-guide.md`
- LMA docs list: `../docs/lma-docs-categorized.md`
- Case law data: `../docs/curated-cases.md`
