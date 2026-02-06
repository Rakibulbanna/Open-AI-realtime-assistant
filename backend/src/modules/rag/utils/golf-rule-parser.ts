import { RuleIngestionRequestDto } from "../dto/rule-query.dto";
import * as fs from "fs";
import * as path from "path";

interface Subsection {
   subsection_code?: string;
   id?: string;
   number?: string;
   title: string;
   heading?: string;
   summary?: string;
   key_points?: string[];
   procedural_steps?: string[];
   penalties?: string[];
}

interface Section {
   section_number?: string;
   id?: string;
   number?: string;
   title: string;
   heading?: string;
   purpose?: string;
   key_points?: string[];
   subsections?: Subsection[];
}

interface GolfRuleJson {
   rule_number: number | string;
   rule_code: string;
   title: string;
   language?: string;
   source?: string;
   summary: {
      short: string;
      detailed: string;
   };
   sections?: Section[];
   original_full_text?: string;
   metadata?: {
      language?: string;
      source?: string;
      version?: string;
   };
}

/**
 * Parse golf rule JSON files and convert to RuleIngestionRequestDto format
 */
export function parseGolfRuleJson(jsonData: GolfRuleJson): RuleIngestionRequestDto[] {
   const rules: RuleIngestionRequestDto[] = [];
   const ruleNumber = String(jsonData.rule_number);
   const ruleCode = jsonData.rule_code || `Rule ${ruleNumber}`;

   // Extract base category from rule title/content
   const baseCategory = extractCategory(jsonData.title, jsonData.summary.detailed);

   // Create main rule document
   const mainRule: RuleIngestionRequestDto = {
      title: `${ruleCode}: ${jsonData.title}`,
      content: buildMainRuleContent(jsonData),
      category: baseCategory,
      tags: extractTags(jsonData, baseCategory),
      metadata: {
         rule_number: ruleNumber,
         rule_code: ruleCode,
         language: jsonData.language || jsonData.metadata?.language || "sv",
         source: jsonData.source || jsonData.metadata?.source || "R&A/USGA Rules of Golf",
      },
   };
   rules.push(mainRule);

   // Create documents for each section
   for (const section of jsonData.sections || []) {
      const sectionNumber = section.section_number || section.number || section.id || "";
      const sectionTitle = section.title || section.heading || "";

      // Main section document
      const sectionRule: RuleIngestionRequestDto = {
         title: `${ruleCode} ${sectionNumber}: ${sectionTitle}`,
         content: buildSectionContent(section, jsonData),
         category: baseCategory,
         tags: extractSectionTags(section, baseCategory, ruleNumber),
         metadata: {
            rule_number: ruleNumber,
            rule_code: ruleCode,
            section_number: sectionNumber,
            language: jsonData.language || jsonData.metadata?.language || "sv",
         },
      };
      rules.push(sectionRule);

      // Create documents for each subsection
      if (section.subsections && section.subsections.length > 0) {
         for (const subsection of section.subsections) {
            const subsectionCode = subsection.subsection_code || subsection.number || subsection.id || "";
            const subsectionTitle = subsection.title || subsection.heading || "";

            const subsectionRule: RuleIngestionRequestDto = {
               title: `${ruleCode} ${sectionNumber}${subsectionCode ? `.${subsectionCode}` : ""}: ${subsectionTitle}`,
               content: buildSubsectionContent(subsection, section, jsonData),
               category: baseCategory,
               tags: extractSubsectionTags(subsection, baseCategory, ruleNumber, sectionNumber),
               metadata: {
                  rule_number: ruleNumber,
                  rule_code: ruleCode,
                  section_number: sectionNumber,
                  subsection_code: subsectionCode,
                  language: jsonData.language || jsonData.metadata?.language || "sv",
               },
            };
            rules.push(subsectionRule);
         }
      }
   }

   return rules;
}

/**
 * Extract category from rule title and content
 */
function extractCategory(title: string, detailedSummary: string): string {
   const text = `${title} ${detailedSummary}`.toLowerCase();

   if (text.includes("green") || text.includes("putting")) return "green";
   if (text.includes("bunker") || text.includes("sand")) return "bunker";
   if (text.includes("rough")) return "rough";
   if (text.includes("fairway")) return "fairway";
   if (text.includes("tee") || text.includes("teeing")) return "tee";
   if (text.includes("penalty") || text.includes("pliktområde")) return "penalty_area";
   if (text.includes("unplayable") || text.includes("ospelbar")) return "unplayable";
   if (text.includes("relief") || text.includes("lättnad")) return "relief";
   if (text.includes("ball") && text.includes("procedure")) return "ball_procedures";
   if (text.includes("conduct") || text.includes("etiquette")) return "conduct";

   return "general";
}

/**
 * Extract tags from rule data
 */
function extractTags(rule: GolfRuleJson, category: string): string[] {
   const tags = new Set<string>([category]);
   const text = `${rule.title} ${rule.summary.detailed}`.toLowerCase();

   // Add rule number tag
   tags.add(`rule_${rule.rule_number}`);

   // Extract keywords
   if (text.includes("penalty") || text.includes("plikt")) tags.add("penalty");
   if (text.includes("relief") || text.includes("lättnad")) tags.add("relief");
   if (text.includes("drop") || text.includes("droppa")) tags.add("drop");
   if (text.includes("mark") || text.includes("markera")) tags.add("marking");
   if (text.includes("lift") || text.includes("lyfta")) tags.add("lifting");
   if (text.includes("replace") || text.includes("återplacera")) tags.add("replacement");
   if (text.includes("flagstick") || text.includes("flaggstång")) tags.add("flagstick");
   if (text.includes("ball") || text.includes("boll")) tags.add("ball");

   return Array.from(tags);
}

/**
 * Extract tags for a section
 */
function extractSectionTags(section: Section, category: string, ruleNumber: string): string[] {
   const tags = new Set<string>([category, `rule_${ruleNumber}`]);
   const sectionTitle = section.title || section.heading || "";
   const text = `${sectionTitle} ${section.purpose || ""}`.toLowerCase();

   if (text.includes("penalty") || text.includes("plikt")) tags.add("penalty");
   if (text.includes("relief") || text.includes("lättnad")) tags.add("relief");
   if (text.includes("procedure") || text.includes("förfarande")) tags.add("procedure");

   return Array.from(tags);
}

/**
 * Extract tags for a subsection
 */
function extractSubsectionTags(
   subsection: Subsection,
   category: string,
   ruleNumber: string,
   sectionNumber: string,
): string[] {
   const tags = new Set<string>([category, `rule_${ruleNumber}`, `section_${sectionNumber}`]);
   const subsectionTitle = subsection.title || subsection.heading || "";
   const text = `${subsectionTitle} ${subsection.summary || ""}`.toLowerCase();

   if (text.includes("penalty") || text.includes("plikt")) tags.add("penalty");
   if (text.includes("relief") || text.includes("lättnad")) tags.add("relief");

   return Array.from(tags);
}

/**
 * Build main rule content
 */
function buildMainRuleContent(rule: GolfRuleJson): string {
   const parts: string[] = [];

   parts.push(`Rule ${rule.rule_number}: ${rule.title}`);
   parts.push("");
   parts.push(`Summary: ${rule.summary.detailed}`);

   if (rule.sections && rule.sections.length > 0) {
      parts.push("");
      parts.push("Sections:");
      for (const section of rule.sections) {
         const sectionNum = section.section_number || section.number || section.id || "";
         const sectionTitle = section.title || section.heading || "";
         parts.push(`- ${rule.rule_code} ${sectionNum}: ${sectionTitle}`);
         if (section.purpose) {
            parts.push(`  Purpose: ${section.purpose}`);
         }
      }
   }

   return parts.join("\n");
}

/**
 * Build section content
 */
function buildSectionContent(section: Section, rule: GolfRuleJson): string {
   const parts: string[] = [];

   const sectionNum = section.section_number || section.number || section.id || "";
   const sectionTitle = section.title || section.heading || "";
   parts.push(`${rule.rule_code} ${sectionNum}: ${sectionTitle}`);

   if (section.purpose) {
      parts.push("");
      parts.push(`Purpose: ${section.purpose}`);
   }

   if (section.key_points && section.key_points.length > 0) {
      parts.push("");
      parts.push("Key Points:");
      section.key_points.forEach((point: string) => parts.push(`- ${point}`));
   }

   if (section.subsections && section.subsections.length > 0) {
      parts.push("");
      parts.push("Subsections:");
      for (const subsection of section.subsections) {
         const subNum = subsection.subsection_code || subsection.number || subsection.id || "";
         parts.push(`- ${sectionNum}${subNum ? `.${subNum}` : ""}: ${subsection.title || subsection.heading}`);
         if (subsection.summary) {
            parts.push(`  ${subsection.summary}`);
         }
      }
   }

   return parts.join("\n");
}

/**
 * Build subsection content
 */
function buildSubsectionContent(subsection: Subsection, section: Section, rule: GolfRuleJson): string {
   const parts: string[] = [];

   const sectionNum = section.section_number || section.number || section.id || "";
   const subNum = subsection.subsection_code || subsection.number || subsection.id || "";
   const subsectionTitle = subsection.title || subsection.heading || "";
   parts.push(`${rule.rule_code} ${sectionNum}${subNum ? `.${subNum}` : ""}: ${subsectionTitle}`);

   if (subsection.summary) {
      parts.push("");
      parts.push(`Summary: ${subsection.summary}`);
   }

   if (subsection.key_points && subsection.key_points.length > 0) {
      parts.push("");
      parts.push("Key Points:");
      subsection.key_points.forEach((point: string) => parts.push(`- ${point}`));
   }

   if (subsection.procedural_steps && subsection.procedural_steps.length > 0) {
      parts.push("");
      parts.push("Procedural Steps:");
      subsection.procedural_steps.forEach((step: string, idx: number) => parts.push(`${idx + 1}. ${step}`));
   }

   if (subsection.penalties && subsection.penalties.length > 0) {
      parts.push("");
      parts.push("Penalties:");
      subsection.penalties.forEach((penalty: string) => parts.push(`- ${penalty}`));
   }

   return parts.join("\n");
}

/**
 * Load and parse all golf rule JSON files from directory
 */
export function loadGolfRulesFromJsonFiles(directoryPath: string): RuleIngestionRequestDto[] {
   const allRules: RuleIngestionRequestDto[] = [];

   try {
      const files = fs.readdirSync(directoryPath);
      const jsonFiles = files.filter((file) => file.endsWith(".json"));

      for (const file of jsonFiles) {
         const filePath = path.join(directoryPath, file);
         const fileContent = fs.readFileSync(filePath, "utf-8");
         const jsonData: GolfRuleJson = JSON.parse(fileContent);

         const parsedRules = parseGolfRuleJson(jsonData);
         allRules.push(...parsedRules);
      }
   } catch (error) {
      console.error(`Error loading golf rules from ${directoryPath}:`, error);
      throw error;
   }

   return allRules;
}
