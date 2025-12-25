/**
 * LMA Lens - Shared Types
 */

// Case Law
export interface CaseLaw {
  id: string;
  canonical_citation: string;
  alternative_citations?: string[];
  short_name: string;
  title: string;
  year: number;
  jurisdiction: string;
  court_level: 'SUPREME' | 'APPELLATE' | 'TRIAL' | 'STATUTE' | 'REGULATORY';
  authority_tier: 1 | 2 | 3;
  isCanonical: true;
  issue_types: string[];
  key_holding: string;
  summary?: string;
  url: string;
  pdf_url?: string;
}

// Contract Analysis
export interface Clause {
  id: string;
  section: string;
  text: string;
  type: ClauseType;
  parentSection?: string; // For hierarchy tracking
}

export type ClauseType =
  | 'MAC'
  | 'financial_covenant'
  | 'representation'
  | 'default'
  | 'definition'
  | 'general';

export interface Issue {
  id: string;
  type: IssueType;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  clauseId: string;
  clauseText: string;
  section: string;
}

export type IssueType =
  | 'circular_definition'
  | 'vague_mac'
  | 'outdated_reference'
  | 'missing_cross_reference'
  | 'inconsistent_terminology';

export interface GroundedIssue extends Issue {
  analysis: string;
  citations: Citation[];
  legalBasis: string;
}

export interface Citation {
  title: string;
  citation?: string;
  year: number;
  url: string;
  isCanonical?: boolean;
}

// Gemini Integration
export interface GeminiSearchResult {
  answer: string;
  citations: GeminiCitation[];
}

export interface GeminiCitation {
  title: string;
  url: string;
  year?: number;
}

// Analysis Results
export interface AnalysisResult {
  contractName: string;
  analyzedAt: string;
  totalIssues: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  issues: GroundedIssue[];
}
