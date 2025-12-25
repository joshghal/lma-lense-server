#!/usr/bin/env node

/**
 * LMA Lens - MCP Server
 * Contract Intelligence for the Loan Market
 */

import 'dotenv/config';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { parsePDF, extractClauses, getDocumentStats } from './parser.js';
import { detectIssues } from './detector.js';
import { analyzeIssues } from './analyzer.js';
import type { AnalysisResult } from './types.js';

// Server setup
const server = new Server(
  {
    name: 'lma-lens',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Tool: analyze_contract
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'analyze_contract',
        description: 'Analyze a loan contract for structural issues, grounded in English case law and LMA best practices',
        inputSchema: {
          type: 'object',
          properties: {
            filepath: {
              type: 'string',
              description: 'Path to the PDF contract to analyze',
            },
            contractName: {
              type: 'string',
              description: 'Optional name for the contract (defaults to filename)',
            },
          },
          required: ['filepath'],
        },
      },
    ],
  };
});

// Tool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === 'analyze_contract') {
    const { filepath, contractName } = request.params.arguments as {
      filepath: string;
      contractName?: string;
    };

    try {
      console.error('\n🔍 Starting contract analysis...');
      console.error(`File: ${filepath}\n`);

      // Step 1: Parse PDF
      console.error('📄 Parsing PDF...');
      const text = await parsePDF(filepath);
      const stats = getDocumentStats(text);
      console.error(
        `✓ Extracted ${stats.wordCount} words (~${stats.pageEstimate} pages)\n`
      );

      // Step 2: Extract clauses with enhanced regex
      const clauses = extractClauses(text);
      console.error(`✓ Found ${clauses.length} clauses\n`);

      // Step 3: Detect issues
      console.error('🔎 Detecting issues with AI...');
      const issues = await detectIssues(clauses);
      console.error(`✓ Detected ${issues.length} potential issues\n`);

      // Step 4: Analyze and ground issues
      console.error('⚖️  Grounding in case law...');
      const groundedIssues = await analyzeIssues(issues);
      console.error(`✓ Generated legal analysis\n`);

      // Build result
      const result: AnalysisResult = {
        contractName: contractName || filepath.split('/').pop() || 'Unknown',
        analyzedAt: new Date().toISOString(),
        totalIssues: groundedIssues.length,
        critical: groundedIssues.filter((i) => i.severity === 'CRITICAL').length,
        high: groundedIssues.filter((i) => i.severity === 'HIGH').length,
        medium: groundedIssues.filter((i) => i.severity === 'MEDIUM').length,
        low: groundedIssues.filter((i) => i.severity === 'LOW').length,
        issues: groundedIssues,
      };

      console.error('✅ Analysis complete!\n');
      console.error(`Summary: ${result.critical} critical, ${result.high} high, ${result.medium} medium, ${result.low} low\n`);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      console.error('❌ Analysis failed:', error);
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
        isError: true,
      };
    }
  }

  throw new Error(`Unknown tool: ${request.params.name}`);
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('LMA Lens MCP server running on stdio');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
