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
      model: 'gemini-2.5-flash',
      generationConfig: {
        temperature: 0.2, // Lower for more factual responses
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 1024,
      },
    });

    // Use Google Search grounding for legal precedent
    const result = await model.generateContent({
      contents: [{
        role: 'user',
        parts: [{ text: query }],
      }],
      tools: [{
        googleSearchRetrieval: {
          dynamicRetrievalConfig: {
            mode: 'MODE_DYNAMIC' as const,
            dynamicThreshold: 0.7,
          },
        },
      }],
    });

    const response = result.response;
    const answer = response.text();
    const citations = extractCitations(response);

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
 * Extract citations from Gemini grounding metadata
 */
function extractCitations(response: any): GeminiCitation[] {
  try {
    // Access grounding metadata
    const groundingMetadata = response.groundingMetadata;
    if (!groundingMetadata) {
      return [];
    }

    const chunks = groundingMetadata.groundingChunks || [];
    const citations: GeminiCitation[] = [];

    for (const chunk of chunks) {
      if (chunk.web) {
        const title = chunk.web.title || 'Unknown Source';
        const url = chunk.web.uri || '';
        const year = extractYearFromTitle(title) || extractYearFromUrl(url);

        citations.push({
          title,
          url,
          year,
        });
      }
    }

    // Remove duplicates by URL
    const unique = Array.from(
      new Map(citations.map((c) => [c.url, c])).values()
    );

    return unique;
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
 */
function extractYearFromUrl(url: string): number | undefined {
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
