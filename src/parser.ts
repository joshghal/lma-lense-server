/**
 * PDF Parser
 * Extracts text and clauses from contract PDFs
 */

import pdf from 'pdf-parse';
import { readFileSync } from 'fs';
import type { Clause, ClauseType } from './types.js';

/**
 * Parse PDF file to text
 */
export async function parsePDF(filepath: string): Promise<string> {
  try {
    const dataBuffer = readFileSync(filepath);
    const data = await pdf(dataBuffer);
    return data.text;
  } catch (error) {
    throw new Error(
      `Failed to parse PDF: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Extract clauses from contract text using comprehensive regex
 * Handles all numbering schemes: 1., 1.1, (a), (i), Clauses, Articles, Schedules
 */
export function extractClauses(text: string): Clause[] {
  console.error('📋 Extracting clauses with enhanced regex...');
  return extractClausesRegex(text);
}

/**
 * Comprehensive regex-based clause extraction
 * Handles: 1., 1.1, (a), (i), CLAUSE, ARTICLE, SCHEDULE, etc.
 */
function extractClausesRegex(text: string): Clause[] {
  console.error('\n========== COMPREHENSIVE REGEX PARSING ==========');

  interface Match {
    section: string;
    header: string;
    startIndex: number;
    level: number;
    type: 'clause' | 'article' | 'schedule' | 'part' | 'decimal' | 'letter' | 'roman';
  }

  const matches: Match[] = [];

  // Pattern 1: Top-level markers (CLAUSE 1, ARTICLE I, SCHEDULE 1, PART A, APPENDIX 1)
  // Fully case-insensitive: matches "CLAUSE 1", "Clause 1", "clause 1", etc.
  // Allow: numbers (1, 2), roman numerals (I, II, i, ii), or single letters (A, a, B, b)
  const topLevelPattern = /\n((?:CLAUSE|ARTICLE|SCHEDULE|APPENDIX|PART)\s+(?:[IVXivx]+|\d+|[A-Za-z]))\s*[:\n–-]\s*([^\n]*)/gi;
  for (const match of text.matchAll(topLevelPattern)) {
    matches.push({
      section: match[1].trim(),
      header: match[2].trim(),
      startIndex: match.index!,
      level: 0,
      type: match[1].toLowerCase().includes('clause') ? 'clause' :
            match[1].toLowerCase().includes('article') ? 'article' :
            match[1].toLowerCase().includes('schedule') ? 'schedule' :
            match[1].toLowerCase().includes('part') ? 'part' : 'decimal',
    });
  }

  // Pattern 2: Decimal numbering (1., 1.1, 1.1.1, etc.)
  // CRITICAL: Exclude TOC entries with dots (e.g., "1. DEFINITIONS........ 5")
  // Use negative lookahead to reject lines with multiple dots or page numbers at end
  const decimalPattern = /\n(\d+(?:\.\d+)*)\.?\s+([^\n]+?)(?=\n)/g;
  for (const match of text.matchAll(decimalPattern)) {
    const section = match[1];
    const header = match[2].trim();

    // Filter out TOC entries: lines with dots/dashes leading to page numbers
    if (/\.{3,}|\.{2,}\s*\d+$|[.-]{5,}/.test(header)) {
      continue; // Skip TOC entries like "DEFINITIONS........ 5"
    }

    const level = section.split('.').length - 1;
    matches.push({
      section: section,
      header: header,
      startIndex: match.index!,
      level: level + 1,
      type: 'decimal',
    });
  }

  // Pattern 3: Letter paragraphs ((a), (b), (aa), (bb), etc.)
  // Allow optional leading whitespace for indented paragraphs
  const letterPattern = /\n\s*\(([a-z]{1,2})\)\s+([^\n]+)/g;
  for (const match of text.matchAll(letterPattern)) {
    matches.push({
      section: `(${match[1]})`,
      header: match[2].trim(),
      startIndex: match.index!,
      level: 3,
      type: 'letter',
    });
  }

  // Pattern 4: Roman numerals lowercase ((i), (ii), (iii), (iv), etc.)
  // Allow optional leading whitespace for indented paragraphs
  const romanPattern = /\n\s*\((i{1,3}|iv|v|vi{0,3}|ix|x|xi{1,3})\)\s+([^\n]+)/g;
  for (const match of text.matchAll(romanPattern)) {
    matches.push({
      section: `(${match[1]})`,
      header: match[2].trim(),
      startIndex: match.index!,
      level: 4,
      type: 'roman',
    });
  }

  // Pattern 5: Numbers in parentheses ((1), (2), (3), etc.)
  // CRITICAL: Very common alternative to (a), (b), (c) in UK contracts
  const numberPattern = /\n\s*\((\d{1,2})\)\s+([^\n]+)/g;
  for (const match of text.matchAll(numberPattern)) {
    matches.push({
      section: `(${match[1]})`,
      header: match[2].trim(),
      startIndex: match.index!,
      level: 3,
      type: 'letter', // Same level as (a), (b), (c)
    });
  }

  // Pattern 6: Capital Roman numerals ((I), (II), (III), (IV), etc.)
  // Used for major divisions/articles
  const capitalRomanPattern = /\n\s*\((I{1,3}|IV|V|VI{0,3}|IX|X|XI{1,3})\)\s+([^\n]+)/g;
  for (const match of text.matchAll(capitalRomanPattern)) {
    matches.push({
      section: `(${match[1]})`,
      header: match[2].trim(),
      startIndex: match.index!,
      level: 2, // Higher level than lowercase roman
      type: 'decimal',
    });
  }

  // Pattern 7: Capital letters (A., B., C., etc.)
  // CRITICAL: Common in schedules and appendices
  const capitalLetterPattern = /\n([A-Z])\.\s+([^\n]+)/g;
  for (const match of text.matchAll(capitalLetterPattern)) {
    const header = match[2].trim();

    // Filter out false positives: single capital letter might be initial or abbreviation
    // Only accept if followed by substantial text (>15 chars) or known keywords
    if (header.length < 15 && !/^(Corporate|Financial|Legal|Borrower|Lender|Details|Information)/i.test(header)) {
      continue;
    }

    matches.push({
      section: match[1],
      header: header,
      startIndex: match.index!,
      level: 2,
      type: 'decimal',
    });
  }

  console.error(`Found ${matches.length} total matches across all patterns`);

  if (matches.length === 0) {
    console.error('No structured sections found - treating as single clause');
    return [{
      id: 'clause_1',
      section: 'Full Text',
      text: text.trim(),
      type: 'general',
    }];
  }

  // Sort by position in document
  matches.sort((a, b) => a.startIndex - b.startIndex);

  // Build clauses with hierarchy
  const clauses: Clause[] = [];
  const levelStack: string[] = []; // Track parent at each level

  console.error('Pattern breakdown:');
  console.error(`  - Top-level (CLAUSE/ARTICLE/SCHEDULE/PART): ${matches.filter(m => m.level === 0).length}`);
  console.error(`  - Decimal (1., 1.1, etc.): ${matches.filter(m => m.type === 'decimal' && m.level > 0).length}`);
  console.error(`  - Letters ((a), (b), etc.): ${matches.filter(m => m.type === 'letter' && m.section.match(/^\([a-z]{1,2}\)$/)).length}`);
  console.error(`  - Numbers ((1), (2), etc.): ${matches.filter(m => m.section.match(/^\(\d+\)$/)).length}`);
  console.error(`  - Roman lowercase ((i), (ii), etc.): ${matches.filter(m => m.type === 'roman').length}`);
  console.error(`  - Roman uppercase ((I), (II), etc.): ${matches.filter(m => m.section.match(/^\([IVX]+\)$/)).length}`);
  console.error(`  - Capital letters (A., B., etc.): ${matches.filter(m => m.section.match(/^[A-Z]$/)).length}`);

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const startIndex = match.startIndex;
    const endIndex = matches[i + 1]?.startIndex || text.length;

    // Extract clause text
    const fullText = text.substring(startIndex, endIndex).trim();

    // Remove the section header line from the text
    const firstLineEnd = fullText.indexOf('\n');
    const textWithoutHeader = firstLineEnd !== -1
      ? fullText.substring(firstLineEnd + 1).trim()
      : ''; // If no newline, there's no additional content beyond the header

    // Build clause text: if we have a header, use it; otherwise use the full text
    const clauseText = match.header
      ? (textWithoutHeader ? `${match.header}\n\n${textWithoutHeader}` : match.header)
      : textWithoutHeader;

    // Only include if substantial (but more lenient for sub-clauses)
    if (clauseText.length > 10) {
      // Track hierarchy
      levelStack[match.level] = match.section;
      const parentSection = match.level > 0 ? levelStack[match.level - 1] : undefined;

      // Get parent clause text for context-aware detection
      const parentClause = parentSection ? clauses.find(c => c.section === parentSection) : undefined;
      const parentText = parentClause?.text || '';

      clauses.push({
        id: `clause_${i + 1}`,
        section: match.section,
        text: clauseText.substring(0, 2000), // Limit to 2000 chars per clause
        type: detectClauseType(match.header, clauseText, match.section, parentText || parentSection),
        parentSection,
      });
    }
  }

  console.error(`✓ Extracted ${clauses.length} clauses (filtered: length > 10 chars)`);

  // Deduplicate: Remove clauses with same section + text
  const deduplicatedClauses: Clause[] = [];
  const seen = new Map<string, Clause>();

  for (const clause of clauses) {
    const key = `${clause.section}|${clause.text}`;
    const existing = seen.get(key);

    if (!existing) {
      // First occurrence - keep it
      seen.set(key, clause);
      deduplicatedClauses.push(clause);
    } else {
      // Duplicate found - prefer the one with better parentSection
      // Keep the one where parentSection !== section (avoid self-reference)
      if (existing.parentSection === existing.section && clause.parentSection !== clause.section) {
        // Replace existing with better one
        const index = deduplicatedClauses.indexOf(existing);
        if (index !== -1) {
          deduplicatedClauses[index] = clause;
          seen.set(key, clause);
        }
      }
      // Otherwise skip this duplicate
    }
  }

  const removedCount = clauses.length - deduplicatedClauses.length;
  if (removedCount > 0) {
    console.error(`✓ Removed ${removedCount} duplicate clauses`);
  }

  console.error('Clause types:', deduplicatedClauses.reduce((acc, c) => {
    acc[c.type] = (acc[c.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>));
  console.error('Hierarchy depth:', Math.max(...deduplicatedClauses.filter(c => c.parentSection).map(c => {
    let depth = 0;
    let parent = c.parentSection;
    while (parent) {
      depth++;
      parent = deduplicatedClauses.find(cl => cl.section === parent)?.parentSection;
    }
    return depth;
  }), 0));
  console.error('==================================================\n');

  return deduplicatedClauses;
}

/**
 * Create compact representation of clauses for efficient AI processing
 * Reduces token usage by 80-90% while maintaining key information
 */
export function compactClausesForAI(clauses: Clause[]): Array<{
  section: string;
  type: ClauseType;
  preview: string;
  parentSection?: string;
  fullTextId: string; // ID to retrieve full text if needed
}> {
  return clauses.map((clause) => {
    // Extract header (first line) and preview (first 100 chars of content)
    const lines = clause.text.split('\n');
    const header = lines[0].trim();
    const content = lines.slice(1).join(' ').trim();
    const preview = content.length > 100 ? content.substring(0, 100) + '...' : content;

    return {
      section: clause.section,
      type: clause.type,
      preview: header + (preview ? ' | ' + preview : ''),
      parentSection: clause.parentSection,
      fullTextId: clause.id,
    };
  });
}

/**
 * Filter clauses to high-risk types only for focused analysis
 */
export function filterHighRiskClauses(clauses: Clause[]): Clause[] {
  const highRiskTypes: ClauseType[] = [
    'financial_covenant',
    'MAC',
    'default',
    'representation',
  ];

  return clauses.filter(c => highRiskTypes.includes(c.type));
}

/**
 * Group clauses by type for type-specific analysis
 */
export function groupClausesByType(clauses: Clause[]): Record<ClauseType, Clause[]> {
  const grouped: Record<string, Clause[]> = {
    definition: [],
    MAC: [],
    financial_covenant: [],
    representation: [],
    default: [],
    general: [],
  };

  for (const clause of clauses) {
    grouped[clause.type].push(clause);
  }

  return grouped as Record<ClauseType, Clause[]>;
}

/**
 * Detect clause type from header, content, and context
 */
function detectClauseType(header: string, text: string, _section?: string, parentSection?: string): ClauseType {
  const combined = `${header} ${text}`.toLowerCase();

  // Check parent context (works for any contract structure)
  // If parent header mentions the clause type, children likely inherit it
  if (parentSection) {
    const parentLower = parentSection.toLowerCase();

    // Parent is about defaults → children are defaults
    if (parentLower.includes('event') && parentLower.includes('default')) {
      return 'default';
    }

    // Parent is about covenants → children are covenants
    if (parentLower.includes('financial covenant') ||
        (parentLower.includes('covenant') && !parentLower.includes('negative'))) {
      return 'financial_covenant';
    }

    // Parent is about representations → children are representations
    if (parentLower.includes('representation') ||
        parentLower.includes('warrant') ||
        parentLower.includes('warranties')) {
      return 'representation';
    }

    // Parent mentions MAC → children are MAC
    if (parentLower.includes('material adverse')) {
      return 'MAC';
    }
  }

  // MAC clauses
  if (
    combined.includes('material adverse') ||
    combined.includes('mac clause') ||
    combined.includes('material adverse change') ||
    combined.includes('material adverse effect')
  ) {
    return 'MAC';
  }

  // Financial covenants (expanded keywords)
  if (
    combined.includes('financial covenant') ||
    combined.includes('ebitda') ||
    combined.includes('debt to equity') ||
    combined.includes('leverage ratio') ||
    combined.includes('leverage') ||
    combined.includes('interest cover') ||
    combined.includes('interest service') ||
    combined.includes('debt service') ||
    combined.includes('cash flow cover') ||
    combined.includes('financial ratio') ||
    combined.includes('covenant ratio')
  ) {
    return 'financial_covenant';
  }

  // Representations (expanded)
  if (
    combined.includes('represent') ||
    combined.includes('warranty') ||
    combined.includes('warrants that') ||
    combined.includes('status') && (combined.includes('duly') || combined.includes('validly'))
  ) {
    return 'representation';
  }

  // Events of default (expanded keywords)
  if (
    combined.includes('event of default') ||
    combined.includes('events of default') ||
    combined.includes('default provisions') ||
    combined.includes('non-payment') ||
    combined.includes('cross default') ||
    combined.includes('cross-default') ||
    combined.includes('insolvency') ||
    combined.includes('acceleration') ||
    combined.includes('misrepresentation') && combined.includes('default')
  ) {
    return 'default';
  }

  // Definitions
  if (
    combined.includes('definitions') ||
    combined.includes('defined terms') ||
    combined.includes('interpretation') ||
    /means|shall mean|is defined as/.test(combined)
  ) {
    return 'definition';
  }

  return 'general';
}

/**
 * Get document summary statistics
 */
export function getDocumentStats(text: string): {
  totalLength: number;
  wordCount: number;
  pageEstimate: number;
} {
  const words = text.split(/\s+/).filter((w) => w.length > 0);

  return {
    totalLength: text.length,
    wordCount: words.length,
    pageEstimate: Math.ceil(words.length / 300), // ~300 words per page
  };
}
