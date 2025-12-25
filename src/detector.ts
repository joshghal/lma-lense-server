/**
 * Issue Detector
 * Uses Gemini to detect structural issues in contract clauses
 */

import { searchLegalPrecedent } from './gemini.js';
import type { Clause, Issue, IssueType } from './types.js';

/**
 * Detect issues in all clauses using AI (BATCHED - single API call)
 */
export async function detectIssues(clauses: Clause[]): Promise<Issue[]> {
  console.error(`Analyzing ${clauses.length} clauses in batch...`);

  try {
    // Build single batch prompt with ALL clauses
    const prompt = buildBatchDetectionPrompt(clauses);

    // Single API call for all clauses
    const result = await searchLegalPrecedent(prompt);

    // Parse all issues from batch response
    const issues = parseBatchIssuesFromResponse(result.answer, clauses);

    console.error(`Found ${issues.length} potential issues`);
    return issues;
  } catch (error) {
    console.error('Error analyzing clauses:', error);
    return [];
  }
}

/**
 * Build batch prompt for all clauses
 */
function buildBatchDetectionPrompt(clauses: Clause[]): string {
  const clauseList = clauses.map((clause, index) => `
CLAUSE ${index + 1}:
Section: ${clause.section}
Type: ${clause.type}
Text: ${clause.text.substring(0, 500)}${clause.text.length > 500 ? '...' : ''}
`).join('\n---\n');

  return `
You are a senior contract analyst reviewing loan documentation under English law. Analyze these ${clauses.length} contract clauses for structural defects.

${clauseList}

DETECT THESE SPECIFIC ISSUES:

1. **Circular Definition** (CRITICAL)
   - A term defined using itself (e.g., "X means any event that constitutes X")
   - Provides no objective meaning
   - Example: "Material Adverse Effect means any effect that is materially adverse"

2. **Vague MAC Clause** (HIGH)
   - Material Adverse Change/Effect without measurable criteria
   - No threshold, percentage, or objective standard
   - Example: "reasonable financial condition" without definition

3. **Outdated Reference** (CRITICAL)
   - LIBOR (discontinued Dec 2021)
   - Telex, facsimile, fax as sole communication method
   - Pre-GDPR data protection language

4. **Missing Cross-Reference** (MEDIUM)
   - Reference to "Section X" or "Schedule Y" that doesn't exist
   - "As defined above" with no prior definition
   - Check only explicit section/schedule references

5. **Inconsistent Terminology** (MEDIUM)
   - Same concept called different names (e.g., "Lender" vs "Bank")
   - Defined term used without initial caps elsewhere
   - Mixing British/American spelling of key terms

SEVERITY GUIDELINES:
- CRITICAL: Renders clause unenforceable or violates regulations
- HIGH: Creates significant uncertainty or litigation risk
- MEDIUM: May cause interpretative disputes
- LOW: Minor drafting inconsistencies

RESPOND IN JSON FORMAT:
{
  "issues": [
    {
      "clauseNumber": 1,
      "type": "circular_definition",
      "severity": "CRITICAL",
      "description": "The term 'Material Adverse Effect' is defined by reference to itself"
    }
  ]
}

INSTRUCTIONS:
- Only flag genuine issues (be conservative, not aggressive)
- Each issue MUST reference specific text in the clause
- Include "clauseNumber" (1-${clauses.length}) to identify which clause
- If no issues found, return: {"issues": []}

RESPOND ONLY WITH VALID JSON.
`;
}

/**
 * Parse batch Gemini response to extract detected issues
 */
function parseBatchIssuesFromResponse(response: string, clauses: Clause[]): Issue[] {
  const issues: Issue[] = [];

  try {
    // Try to extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*"issues"[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('No JSON found in response, trying heuristic parsing');
      return parseHeuristicBatchIssues(response, clauses);
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const detectedIssues = parsed.issues || [];

    for (const detected of detectedIssues) {
      // Map clauseNumber back to actual clause
      const clauseIndex = (detected.clauseNumber || 1) - 1;
      const clause = clauses[clauseIndex] || clauses[0];

      issues.push({
        id: `issue_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
        type: detected.type as IssueType,
        severity: detected.severity || determineSeverity(detected.type),
        clauseId: clause.id,
        clauseText: clause.text,
        section: clause.section,
      });
    }
  } catch (error) {
    console.error('Error parsing detection response:', error);
    // Fallback to heuristic detection
    return parseHeuristicBatchIssues(response, clauses);
  }

  return issues;
}

/**
 * Fallback: Parse issues using heuristics if JSON parsing fails (batch version)
 */
function parseHeuristicBatchIssues(_response: string, clauses: Clause[]): Issue[] {
  const issues: Issue[] = [];

  // Check each clause for common patterns
  for (const clause of clauses) {
    const clauseLower = clause.text.toLowerCase();

    // Check for circular definition
    if (clauseLower.includes('means') && clauseLower.includes('material adverse')) {
      const words = clauseLower.split(/\s+/);
      if (words.filter(w => w.includes('material')).length > 2) {
        issues.push({
          id: `issue_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
          type: 'circular_definition',
          severity: 'CRITICAL',
          clauseId: clause.id,
          clauseText: clause.text,
          section: clause.section,
        });
      }
    }

    // Check for vague MAC
    if (
      clauseLower.includes('material adverse') &&
      !clauseLower.includes('exceeding') &&
      !clauseLower.includes('threshold')
    ) {
      issues.push({
        id: `issue_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
        type: 'vague_mac',
        severity: 'HIGH',
        clauseId: clause.id,
        clauseText: clause.text,
        section: clause.section,
      });
    }

    // Check for outdated reference
    if (
      clauseLower.includes('libor') ||
      clauseLower.includes('telex') ||
      clauseLower.includes('facsimile') ||
      (clauseLower.includes('fax') && !clauseLower.includes('ifax'))
    ) {
      issues.push({
        id: `issue_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
        type: 'outdated_reference',
        severity: 'CRITICAL',
        clauseId: clause.id,
        clauseText: clause.text,
        section: clause.section,
      });
    }
  }

  return issues;
}

/**
 * Determine severity based on issue type
 */
function determineSeverity(
  type: string
): 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' {
  const severityMap: Record<string, 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'> = {
    circular_definition: 'CRITICAL',
    outdated_reference: 'CRITICAL',
    vague_mac: 'HIGH',
    missing_cross_reference: 'MEDIUM',
    inconsistent_terminology: 'MEDIUM',
  };

  return severityMap[type] || 'MEDIUM';
}
