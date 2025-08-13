#!/usr/bin/env node

/**
 * RIXA Language Capabilities Report Generator
 * 
 * This script generates comprehensive reports about language support,
 * capabilities, and progress tracking for RIXA MCP.
 */

import * as fs from 'fs';
import * as path from 'path';

interface LanguageProgress {
  tier: number;
  status: string;
  dap_score: number;
  specialized_score: number;
  overall_score: number;
  adoption_rate: number;
  success_rate: number;
  capabilities: any;
  roadmap: any;
  best_tools: string[];
}

interface ProgressData {
  metadata: {
    lastUpdated: string;
    version: string;
    nextReview: string;
  };
  languages: Record<string, LanguageProgress>;
  summary: any;
}

class LanguageReportGenerator {
  private progressData: ProgressData;
  private outputDir: string;

  constructor() {
    this.outputDir = path.join(__dirname, '..', 'docs', 'reports');
    this.ensureOutputDir();
    this.loadProgressData();
  }

  private ensureOutputDir(): void {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  private loadProgressData(): void {
    const progressFile = path.join(__dirname, '..', 'docs', 'language-progress-tracker.json');
    const data = fs.readFileSync(progressFile, 'utf-8');
    this.progressData = JSON.parse(data);
  }

  /**
   * Generate executive summary report
   */
  generateExecutiveSummary(): void {
    const summary = this.progressData.summary;
    const languages = this.progressData.languages;

    const report = `# 📊 RIXA Language Support - Executive Summary

## 🎯 Key Metrics

- **Total Languages Supported**: ${summary.total_languages}
- **Production Ready**: ${summary.production_ready} languages
- **Average Success Rate**: ${summary.average_success_rate}%
- **Highest Adoption**: ${this.getLanguageDisplayName(summary.highest_adoption)} (${languages[summary.highest_adoption].adoption_rate}%)
- **Highest Satisfaction**: ${this.getLanguageDisplayName(summary.highest_satisfaction)} (${languages[summary.highest_satisfaction].overall_score}/10)

## 🏆 Language Tiers

### Tier 1: Production Ready (${summary.tier_1_languages.length} languages)
${summary.tier_1_languages.map((lang: string) => 
  `- **${this.getLanguageDisplayName(lang)}**: ${languages[lang].overall_score}/10 (${languages[lang].success_rate}% success rate)`
).join('\n')}

### Tier 2: Functional with Gaps (${summary.tier_2_languages.length} languages)
${summary.tier_2_languages.map((lang: string) => 
  `- **${this.getLanguageDisplayName(lang)}**: ${languages[lang].overall_score}/10 (${languages[lang].success_rate}% success rate)`
).join('\n')}

### Tier 3: Basic Implementation (${summary.tier_3_languages.length} languages)
${summary.tier_3_languages.map((lang: string) => 
  `- **${this.getLanguageDisplayName(lang)}**: ${languages[lang].overall_score}/10 (${languages[lang].success_rate}% success rate)`
).join('\n')}

## 🚀 Next Quarter Priorities

${summary.next_priorities.map((priority: string) => `- ${priority.replace('_', ' ').toUpperCase()}`).join('\n')}

## 📈 Adoption Trends

${Object.entries(languages)
  .sort(([,a], [,b]) => (b as LanguageProgress).adoption_rate - (a as LanguageProgress).adoption_rate)
  .map(([lang, data]) => `- **${this.getLanguageDisplayName(lang)}**: ${(data as LanguageProgress).adoption_rate}%`)
  .join('\n')}

---
*Generated on: ${new Date().toISOString()}*
*Data from: ${this.progressData.metadata.lastUpdated}*
`;

    fs.writeFileSync(path.join(this.outputDir, 'executive-summary.md'), report);
    console.log('✅ Executive summary generated');
  }

  /**
   * Generate detailed language report
   */
  generateLanguageDetails(): void {
    Object.entries(this.progressData.languages).forEach(([langKey, langData]) => {
      const report = this.generateSingleLanguageReport(langKey, langData);
      const filename = `${langKey}-detailed-report.md`;
      fs.writeFileSync(path.join(this.outputDir, filename), report);
    });
    console.log('✅ Detailed language reports generated');
  }

  private generateSingleLanguageReport(langKey: string, langData: LanguageProgress): string {
    const langName = this.getLanguageDisplayName(langKey);
    
    return `# ${langName} - Detailed Capability Report

## 📊 Overview

- **Tier**: ${langData.tier}
- **Status**: ${langData.status.replace('_', ' ').toUpperCase()}
- **Overall Score**: ${langData.overall_score}/10
- **DAP Score**: ${langData.dap_score}/10
- **Specialized Score**: ${langData.specialized_score}/10
- **Adoption Rate**: ${langData.adoption_rate}%
- **Success Rate**: ${langData.success_rate}%

## 🛠️ Capabilities Analysis

### Traditional DAP Capabilities
${this.generateCapabilityTable(langData.capabilities.traditional_dap)}

### Language-Specific Capabilities
${this.generateCapabilityTable(langData.capabilities[Object.keys(langData.capabilities)[1]])}

## 🗺️ Roadmap

${Object.entries(langData.roadmap).map(([quarter, items]) => 
  `### ${quarter.toUpperCase()}\n${(items as string[]).map(item => `- ${item}`).join('\n')}`
).join('\n\n')}

## 🔧 Recommended Tools

${langData.best_tools.map(tool => `- ${tool}`).join('\n')}

## 📈 Performance Metrics

- **Success Rate**: ${langData.success_rate}% (Industry average: 65%)
- **User Satisfaction**: ${langData.overall_score}/10
- **Adoption Growth**: ${langData.adoption_rate > 10 ? 'High' : langData.adoption_rate > 5 ? 'Medium' : 'Low'}

---
*Generated on: ${new Date().toISOString()}*
`;
  }

  private generateCapabilityTable(capabilities: any): string {
    if (!capabilities) return 'No capabilities data available.';
    
    return `| Feature | Status | Score | Notes |
|---------|--------|-------|-------|
${Object.entries(capabilities).map(([feature, data]: [string, any]) => 
  `| ${feature.replace('_', ' ')} | ${data.status} | ${data.score}/10 | ${data.notes} |`
).join('\n')}`;
  }

  /**
   * Generate progress tracking report
   */
  generateProgressReport(): void {
    const languages = this.progressData.languages;
    
    const report = `# 📈 RIXA Language Progress Tracking

## 🎯 Progress Overview

${Object.entries(languages).map(([langKey, langData]) => {
  const langName = this.getLanguageDisplayName(langKey);
  const progressBar = this.generateProgressBar(langData.overall_score);
  return `### ${langName}
${progressBar} ${langData.overall_score}/10
- **Status**: ${langData.status.replace('_', ' ')}
- **Success Rate**: ${langData.success_rate}%
- **Next Milestone**: ${this.getNextMilestone(langKey, langData)}
`;
}).join('\n')}

## 📊 Comparative Analysis

### Success Rate Ranking
${Object.entries(languages)
  .sort(([,a], [,b]) => (b as LanguageProgress).success_rate - (a as LanguageProgress).success_rate)
  .map(([lang, data], index) => `${index + 1}. **${this.getLanguageDisplayName(lang)}**: ${(data as LanguageProgress).success_rate}%`)
  .join('\n')}

### Overall Score Ranking
${Object.entries(languages)
  .sort(([,a], [,b]) => (b as LanguageProgress).overall_score - (a as LanguageProgress).overall_score)
  .map(([lang, data], index) => `${index + 1}. **${this.getLanguageDisplayName(lang)}**: ${(data as LanguageProgress).overall_score}/10`)
  .join('\n')}

## 🚀 Improvement Opportunities

${this.generateImprovementOpportunities()}

---
*Generated on: ${new Date().toISOString()}*
`;

    fs.writeFileSync(path.join(this.outputDir, 'progress-tracking.md'), report);
    console.log('✅ Progress tracking report generated');
  }

  private generateProgressBar(score: number): string {
    const filled = Math.round(score);
    const empty = 10 - filled;
    return '🟩'.repeat(filled) + '⬜'.repeat(empty);
  }

  private getNextMilestone(langKey: string, langData: LanguageProgress): string {
    const roadmap = langData.roadmap;
    const nextQuarter = Object.keys(roadmap)[0];
    const nextItems = roadmap[nextQuarter];
    return nextItems[0] || 'No immediate milestones';
  }

  private generateImprovementOpportunities(): string {
    const languages = this.progressData.languages;
    const opportunities = [];

    // Find languages with low scores
    Object.entries(languages).forEach(([langKey, langData]) => {
      if (langData.overall_score < 7) {
        opportunities.push(`- **${this.getLanguageDisplayName(langKey)}**: Focus on ${this.getWeakestArea(langData)}`);
      }
    });

    return opportunities.join('\n') || 'All languages performing well!';
  }

  private getWeakestArea(langData: LanguageProgress): string {
    if (langData.dap_score < langData.specialized_score) {
      return 'improving DAP capabilities';
    } else {
      return 'developing specialized tools';
    }
  }

  private getLanguageDisplayName(langKey: string): string {
    const displayNames: Record<string, string> = {
      'java': 'Java',
      'python': 'Python',
      'typescript_javascript': 'TypeScript/JavaScript',
      'go': 'Go',
      'csharp_dotnet': 'C#/.NET',
      'rust': 'Rust',
      'php': 'PHP',
      'ruby': 'Ruby',
      'cpp': 'C/C++'
    };
    return displayNames[langKey] || langKey;
  }

  /**
   * Generate all reports
   */
  generateAllReports(): void {
    console.log('🚀 Generating RIXA language capability reports...');
    
    this.generateExecutiveSummary();
    this.generateLanguageDetails();
    this.generateProgressReport();
    
    console.log('✅ All reports generated successfully!');
    console.log(`📁 Reports saved to: ${this.outputDir}`);
  }
}

// CLI execution
if (require.main === module) {
  const generator = new LanguageReportGenerator();
  
  const command = process.argv[2];
  
  switch (command) {
    case 'summary':
      generator.generateExecutiveSummary();
      break;
    case 'details':
      generator.generateLanguageDetails();
      break;
    case 'progress':
      generator.generateProgressReport();
      break;
    case 'all':
    default:
      generator.generateAllReports();
      break;
  }
}

export { LanguageReportGenerator };
