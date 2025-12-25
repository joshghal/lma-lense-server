/**
 * Gemini Integration
 * Handles legal precedent search with grounding
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import type { GeminiSearchResult, GeminiCitation } from './types.js';

// Initialize Gemini
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  throw new Error('GEMINI_API_KEY environment variable is required');
}

const genAI = new GoogleGenerativeAI(apiKey);

/**
 * Search for legal precedent using Gemini with grounding
 */
export async function searchLegalPrecedent(
  query: string
): Promise<GeminiSearchResult> {
  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash-lite',
      generationConfig: {
        temperature: 0.2, // Lower for more factual responses
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 1024,
      },
    });

    // Generate content based on Gemini's training data
    // (Web grounding is deprecated in this API version)
    const result = await model.generateContent({
      contents: [{
        role: 'user',
        parts: [{ text: query }],
      }],
    });

    const response = result.response;
    const answer = response.text();
    const citations = extractCitations(response);

    // Log response for MCP debugging
    console.error(`[Gemini] Response length: ${answer.length} chars`);

    return {
      answer,
      citations,
    };
  } catch (error) {
    console.error('Gemini search error:', error);
    throw new Error(
      `Failed to search legal precedent: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Build query for specific issue type
 */
export function buildLegalQuery(
  issueType: string,
  clauseText: string
): string {
  const queries: Record<string, string> = {
    circular_definition: `
English law case law on circular definitions in contracts being void for uncertainty.
Focus on binding precedents from UK Supreme Court or Court of Appeal.
Context: Contract clause "${clauseText.substring(0, 100)}..."
`,

    vague_mac: `
English law case law on Material Adverse Change clauses requiring objective criteria.
Focus on enforceability of vague MAC clauses without measurable standards.
Context: Contract clause "${clauseText.substring(0, 100)}..."
`,

    outdated_reference: `
Legal guidance on discontinued benchmarks (LIBOR, EURIBOR) in loan contracts.
Focus on FCA guidance and regulatory requirements for benchmark replacement.
Context: Contract clause "${clauseText.substring(0, 100)}..."
`,

    missing_cross_reference: `
English law case law on missing cross-references creating ambiguity in contracts.
Focus on contra proferentem principle and Arnold v Britton interpretation rules.
Context: Contract clause "${clauseText.substring(0, 100)}..."
`,

    inconsistent_terminology: `
English law case law on inconsistent terminology and ambiguous contract terms.
Focus on Chartbrook v Persimmon and modern interpretation principles.
Context: Contract clause "${clauseText.substring(0, 100)}..."
`,
  };

  return (
    queries[issueType] ||
    `English law case law on ${issueType.replace(/_/g, ' ')} in contracts`
  );
}

/**
 * Extract citations from Gemini response text
 * Since grounding is not available, we parse case names from the response
 */
function extractCitations(response: any): GeminiCitation[] {
  try {
    const text = response.text();
    const citations: GeminiCitation[] = [];

    // Pattern 1: Case citations like "Investors Compensation Scheme v West Bromwich [1998]"
    const casePattern = /([A-Z][A-Za-z\s&]+(?:v|vs)\.?\s+[A-Z][A-Za-z\s&]+)(?:\s*[\[\(](\d{4})[\]\)])?/g;
    const matches = [...text.matchAll(casePattern)];

    for (const match of matches) {
      const title = match[1].trim();
      const year = match[2] ? parseInt(match[2]) : extractYearFromTitle(text);

      // Only add if title looks like a real case name
      if (title.length > 10 && title.length < 100) {
        citations.push({
          title,
          url: `https://www.bailii.org/`, // Generic BAILII link
          year,
        });
      }
    }

    // Pattern 2: Statute references like "Companies Act 2006"
    const statutePattern = /([A-Z][A-Za-z\s]+Act)\s+(\d{4})/g;
    const statuteMatches = [...text.matchAll(statutePattern)];

    for (const match of statuteMatches) {
      citations.push({
        title: `${match[1]} ${match[2]}`,
        url: 'https://www.legislation.gov.uk/',
        year: parseInt(match[2]),
      });
    }

    // Remove duplicates by title
    const unique = Array.from(
      new Map(citations.map((c) => [c.title, c])).values()
    );

    return unique.slice(0, 5); // Limit to top 5
  } catch (error) {
    console.error('Citation extraction error:', error);
    return [];
  }
}

/**
 * Extract year from citation title
 * Looks for patterns like [1992], (2015), or standalone 4-digit years
 */
function extractYearFromTitle(title: string): number | undefined {
  // Pattern 1: [1992] or (1992)
  const bracketMatch = title.match(/[\[\(](\d{4})[\]\)]/);
  if (bracketMatch) {
    return parseInt(bracketMatch[1]);
  }

  // Pattern 2: "Case Name 2015" or "2015 Case Name"
  const yearMatch = title.match(/\b(19\d{2}|20\d{2})\b/);
  if (yearMatch) {
    const year = parseInt(yearMatch[1]);
    // Sanity check: between 1900 and current year + 1
    if (year >= 1900 && year <= new Date().getFullYear() + 1) {
      return year;
    }
  }

  return undefined;
}

/**
 * Extract year from URL (fallback)
 * Currently unused but kept for future URL-based citation extraction
 */
function _extractYearFromUrl(url: string): number | undefined {
  const yearMatch = url.match(/\/(19\d{2}|20\d{2})\//);
  if (yearMatch) {
    return parseInt(yearMatch[1]);
  }
  return undefined;
}

/**
 * Test function for development
 */
export async function testGeminiConnection(): Promise<boolean> {
  try {
    const result = await searchLegalPrecedent(
      'English law case circular definition void for uncertainty'
    );
    console.log('✓ Gemini connected successfully');
    console.log('Answer length:', result.answer.length);
    console.log('Citations found:', result.citations.length);
    return true;
  } catch (error) {
    console.error('✗ Gemini connection failed:', error);
    return false;
  }
}
