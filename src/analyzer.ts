/**
 * Issue Analyzer
 * Generates legal analysis for detected issues
 */

import { readFileSync } from 'fs';
import { searchLegalPrecedent, buildLegalQuery } from './gemini.js';
import type { Issue, GroundedIssue, CaseLaw, Citation } from './types.js';

// Load canonical cases
let canonicalCases: CaseLaw[] = [];
try {
  const casesJson = readFileSync(
    new URL('../data/canonical-cases.json', import.meta.url),
    'utf-8'
  );
  canonicalCases = JSON.parse(casesJson);
  console.error(`✓ Loaded ${canonicalCases.length} canonical cases`);
} catch (error) {
  console.error('Warning: Could not load canonical cases:', error);
}

/**
 * Generate analysis for all issues (BATCHED - single API call)
 */
export async function analyzeIssues(issues: Issue[]): Promise<GroundedIssue[]> {
  if (issues.length === 0) {
    return [];
  }

  console.error(`Generating analysis for ${issues.length} issues in batch...`);

  try {
    // Build single batch prompt with ALL issues
    const prompt = buildBatchAnalysisPrompt(issues);

    // Single API call for all issues
    const result = await searchLegalPrecedent(prompt);

    // Parse batch response
    const analyses = parseBatchAnalysisResponse(result.answer, issues);

    // Enhance citations with canonical flags
    const grounded = analyses.map((analysis) => ({
      ...analysis,
      citations: enhanceCitations(analysis.citations),
    }));

    return grounded;
  } catch (error) {
    console.error('Error generating batch analysis:', error);

    // Return ungrounded issues as fallback
    return issues.map((issue) => ({
      ...issue,
      analysis: 'Analysis unavailable due to API error',
      citations: [],
      legalBasis: 'Error during analysis',
    }));
  }
}

/**
 * Build batch prompt for all issues
 */
function buildBatchAnalysisPrompt(issues: Issue[]): string {
  const issueList = issues.map((issue, index) => {
    return `
ISSUE ${index + 1}:
Type: ${issue.type.replace(/_/g, ' ').toUpperCase()}
Section: ${issue.section}
Severity: ${issue.severity}
Clause Text: "${issue.clauseText.substring(0, 200)}..."
`;
  }).join('\n---\n');

  // Find relevant canonical cases for each issue type
  const relevantCases = issues.map((issue) => {
    const matching = canonicalCases.filter(c =>
      c.issue_types.includes(issue.type)
    );
    return matching.length > 0 ? matching[0] : null;
  });

  const canonicalGuidance = relevantCases.filter(c => c).length > 0
    ? `\n\nRELEVANT CANONICAL CASES:\n${relevantCases.filter(c => c).map((c, i) =>
        `- ${c!.short_name} [${c!.year}]: ${c!.key_holding}`
      ).join('\n')}`
    : '';

  return `
You are a senior legal analyst specializing in English contract law. Analyze these ${issues.length} contract issues and provide detailed legal analysis.

${issueList}
${canonicalGuidance}

INSTRUCTIONS:
For EACH issue, you MUST provide:

1. **Analysis** (MANDATORY 3-5 complete sentences):
   - Sentence 1: State the legal problem clearly
   - Sentence 2: Explain why this is problematic under English law
   - Sentence 3: Reference relevant case law or legal principles
   - Sentence 4: Describe the practical consequences
   - Sentence 5: (Optional) Suggest remediation

2. **Legal Basis** (2-3 sentences): Explain the legal foundation for your analysis

3. **Citations** (at least 1): Cite relevant English case law with full case names and years

EXAMPLE FORMAT:
{
  "analyses": [
    {
      "issueNumber": 1,
      "analysis": "This clause contains a circular definition, which is void for uncertainty under English law. The term 'Material Adverse Effect' is defined by reference to itself, providing no objective criteria. In Scammell v Ouston [1941] AC 251, the House of Lords held that agreements must be sufficiently certain to be enforceable. This circularity renders the clause unenforceable, creating significant risk for both parties. The lender cannot rely on this provision to call a default, and the borrower faces uncertainty about compliance.",
      "legalBasis": "Under English contract law, terms must be sufficiently certain to be enforceable. Circular definitions fail this test as they provide no objective standard. Courts will strike down provisions that lack certainty.",
      "citations": [
        {
          "title": "Scammell v Ouston",
          "year": 1941
        },
        {
          "title": "Walford v Miles",
          "year": 1992
        }
      ]
    }
  ]
}

CRITICAL REQUIREMENTS:
- Analysis MUST be 3-5 sentences (not 1 sentence!)
- Citations MUST include case name and year
- Legal basis MUST be substantive
- Include "issueNumber" (1-${issues.length}) to match each analysis to its issue

RESPOND ONLY WITH VALID JSON.
`;
}

/**
 * Parse batch analysis response with validation
 */
function parseBatchAnalysisResponse(
  response: string,
  issues: Issue[]
): GroundedIssue[] {
  try {
    // Try to extract JSON
    const jsonMatch = response.match(/\{[\s\S]*"analyses"[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('No JSON found in analysis response');
      return buildFallbackAnalysis(response, issues);
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const analyses = parsed.analyses || [];

    // Map analyses back to issues
    return issues.map((issue, index) => {
      const matchingAnalysis = analyses.find(
        (a: any) => a.issueNumber === index + 1
      ) || analyses[index];

      if (matchingAnalysis) {
        // Validate analysis quality
        const analysis = matchingAnalysis.analysis || '';
        const sentenceCount = analysis.split(/[.!?]+/).filter((s: string) => s.trim().length > 10).length;

        // If analysis is too short, enhance it with canonical cases
        const enhancedAnalysis = sentenceCount < 3
          ? enhanceShortAnalysis(issue, analysis)
          : analysis;

        // Extract citations
        let citations = (matchingAnalysis.citations || []).map((c: any) => ({
          title: c.title || 'Unknown',
          year: c.year,
          url: c.url || 'https://www.bailii.org/',
          citation: c.citation,
          isCanonical: false,
        }));

        // Add canonical case citation if none provided
        if (citations.length === 0) {
          const canonicalCitation = findCanonicalCaseForIssue(issue);
          if (canonicalCitation) {
            citations.push(canonicalCitation);
          }
        }

        return {
          ...issue,
          analysis: enhancedAnalysis,
          legalBasis: matchingAnalysis.legalBasis || generateFallbackLegalBasis(issue),
          citations,
        };
      }

      // Fallback if no matching analysis
      return buildSingleFallbackAnalysis(issue);
    });
  } catch (error) {
    console.error('Error parsing batch analysis:', error);
    return buildFallbackAnalysis(response, issues);
  }
}

/**
 * Enhance short analysis with canonical case information
 */
function enhanceShortAnalysis(issue: Issue, shortAnalysis: string): string {
  const canonical = canonicalCases.find(c =>
    c.issue_types.includes(issue.type)
  );

  if (!canonical) {
    return shortAnalysis + ' This issue requires legal review and remediation to ensure enforceability under English contract law.';
  }

  // Build enhanced analysis
  const enhanced = `${shortAnalysis} Under English law, ${canonical.key_holding.toLowerCase()} As established in ${canonical.short_name} [${canonical.year}], such provisions may be challenged for uncertainty or unenforceability. This creates significant risk for all parties to the contract.`;

  return enhanced;
}

/**
 * Find canonical case citation for issue type
 */
function findCanonicalCaseForIssue(issue: Issue): Citation | null {
  const canonical = canonicalCases.find(c =>
    c.issue_types.includes(issue.type)
  );

  if (!canonical) return null;

  return {
    title: canonical.short_name,
    year: canonical.year,
    citation: canonical.canonical_citation,
    url: canonical.url,
    isCanonical: true,
  };
}

/**
 * Generate fallback legal basis for an issue
 */
function generateFallbackLegalBasis(issue: Issue): string {
  const basisMap: Record<string, string> = {
    circular_definition: 'Under English contract law, terms must be sufficiently certain to be enforceable. Circular definitions fail this test as they provide no objective standard for determining meaning or compliance.',
    vague_mac: 'Material Adverse Change clauses must contain objective criteria to be enforceable. Vague MAC clauses without measurable thresholds may be struck down for uncertainty under English law.',
    outdated_reference: 'References to discontinued benchmarks like LIBOR violate regulatory requirements. The FCA mandated transition to alternative reference rates, making such provisions legally problematic and commercially unworkable.',
    missing_cross_reference: 'Cross-references to non-existent provisions create ambiguity. Under the contra proferentem principle, ambiguities are construed against the drafter, potentially undermining the intended legal effect.',
    inconsistent_terminology: 'Inconsistent terminology creates interpretative uncertainty. English courts apply principles from Chartbrook v Persimmon to resolve ambiguity, but parties bear unnecessary litigation risk.',
  };

  return basisMap[issue.type] || 'This issue requires legal review under English contract law principles.';
}

/**
 * Build fallback analysis for all issues
 */
function buildFallbackAnalysis(_response: string, issues: Issue[]): GroundedIssue[] {
  console.error('Using fallback analysis generation');

  return issues.map(issue => buildSingleFallbackAnalysis(issue));
}

/**
 * Build fallback analysis for single issue
 */
function buildSingleFallbackAnalysis(issue: Issue): GroundedIssue {
  const canonical = canonicalCases.find(c =>
    c.issue_types.includes(issue.type)
  );

  const analysisMap: Record<string, string> = {
    circular_definition: `This clause contains a circular definition, which is void for uncertainty under English law. The term is defined by reference to itself, providing no objective criteria for interpretation. Under the principle established in Scammell v Ouston [1941], agreements must be sufficiently certain to be enforceable. This circularity renders the provision unenforceable and creates significant risk for both parties.`,
    vague_mac: `This Material Adverse Change clause lacks objective criteria, making it unenforceable under English law. Without measurable thresholds or defined triggers, the provision is void for uncertainty. Courts have consistently held that MAC clauses must provide clear, objective standards. This vagueness exposes both parties to litigation risk and undermines the commercial certainty the clause was meant to provide.`,
    outdated_reference: `This clause references LIBOR or other discontinued benchmarks, violating regulatory requirements and rendering it legally inoperable. The FCA mandated transition to alternative reference rates by end-2021. Continued use of LIBOR exposes parties to regulatory sanctions and makes the interest calculation mechanism void. Immediate amendment to reference SONIA or another approved rate is legally required.`,
    missing_cross_reference: `This provision references a non-existent section or schedule, creating fatal ambiguity in the contract. Under the contra proferentem principle, such ambiguities are construed against the drafter. This missing cross-reference may render related provisions unenforceable and expose the drafter to breach claims. The reference must be corrected to maintain the provision's intended legal effect.`,
    inconsistent_terminology: `This contract uses inconsistent terminology for the same concept, creating interpretative uncertainty. Under Chartbrook v Persimmon [2009], courts will attempt to resolve ambiguity through contextual interpretation, but this exposes parties to unnecessary litigation risk. Consistent terminology is essential for contractual certainty under English law. The terms should be standardized throughout the document.`,
  };

  const citations: Citation[] = canonical ? [{
    title: canonical.short_name,
    year: canonical.year,
    citation: canonical.canonical_citation,
    url: canonical.url,
    isCanonical: true,
  }] : [];

  return {
    ...issue,
    analysis: analysisMap[issue.type] || 'This issue requires legal review and remediation under English contract law principles.',
    legalBasis: generateFallbackLegalBasis(issue),
    citations,
  };
}

/**
 * Enhance citations by checking against canonical cases
 */
function enhanceCitations(geminiCitations: any[]): Citation[] {
  return geminiCitations.map((cite) => {
    // Check if this matches a canonical case
    const canonical = findCanonicalMatch(cite);

    return {
      title: cite.title,
      citation: canonical?.canonical_citation,
      year: cite.year || canonical?.year,
      url: cite.url || canonical?.url || '',
      isCanonical: !!canonical,
    };
  });
}

/**
 * Find canonical case that matches Gemini citation
 */
function findCanonicalMatch(cite: any): CaseLaw | undefined {
  if (!cite.year) return undefined;

  return canonicalCases.find((c) => {
    // Match by year first
    if (c.year !== cite.year) return false;

    // Fuzzy match by title
    const citeTitle = cite.title.toLowerCase().replace(/[^a-z]/g, '');
    const canonicalTitle = c.short_name.toLowerCase().replace(/[^a-z]/g, '');

    return (
      citeTitle.includes(canonicalTitle) || canonicalTitle.includes(citeTitle)
    );
  });
}
