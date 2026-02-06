import { Injectable } from "@nestjs/common";
import OpenAI from "openai";
import { RuleRetrieverService } from "./rule-retriever.service";
import { EmbeddingService } from "./embedding.service";
import { RuleQueryRequestDto, RuleQueryResponseDto, RetrievedRuleDto, QueryContextDto } from "../dto/rule-query.dto";
import { LieType } from "../../golf-caddie/dto/shot-recommendation.dto";
import { getVoiceToneInstructions } from "src/modules/golf-caddie/utils/assistant-utils";

@Injectable()
export class RagService {
   private readonly openai: OpenAI;
   private readonly model = "gpt-4o-mini";

   constructor(
      private readonly ruleRetrieverService: RuleRetrieverService,
      private readonly embeddingService: EmbeddingService,
   ) {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
         throw new Error("OPENAI_API_KEY environment variable is not set");
      }
      this.openai = new OpenAI({ apiKey });
   }

   /**
    * Process a rule query using RAG
    * OPTIMIZED: Parallel detect + translate, then search with Swedish query for accuracy
    */
   async queryRules(req: RuleQueryRequestDto): Promise<RuleQueryResponseDto> {
      const startTime = Date.now();
      // Step 1: Detect language + Translate to Swedish in PARALLEL
      const [originalLanguage, swedishQuery] = await Promise.all([
         this.embeddingService.detectLanguage(req.query),
         this.embeddingService.translateToSwedish(req.query),
      ]);
      console.log(`[RAG] Step 1 (detect+translate): ${Date.now() - startTime}ms, lang=${originalLanguage}`);

      // Step 2: Vector search with Swedish query (better accuracy with Swedish rules)
      const retrievedRules = await this.ruleRetrieverService.retrieveRulesOptimized(
         swedishQuery,
         req.context,
         req.maxResults,
      );
      console.log(`[RAG] Step 2 (search): ${Date.now() - startTime}ms, found ${retrievedRules.length} rules`);

      // Step 3: Generate answer directly in target language
      let answer: string;
      if (retrievedRules.length === 0) {
         answer = await this.generateAnswerWithoutRulesInLanguage(req.query, originalLanguage, req.context);
      } else if (req.isWebRTCQuery) {
         // Only include first 500 chars of each rule content to reduce tokens
         const rulesText = retrievedRules
            .map((rule, index) => `RULE ${index + 1}: ${rule.title}\n${rule.content.substring(0, 500)}`)
            .join("\n\n");
         // answer = `QUESTION: ${req.query}\n\nRETRIEVED RULES BASED ON THE QUESTION:\n${rulesText}\n\n Answer the question in ${originalLanguage} based on the retrieved rules only. Mention the rule reference in the answer and tell the actual cause is based on the rules provided.Do not use your external knowledge.`;
         answer = `QUESTION: ${req.query}\n\nRETRIEVED RULES BASED ON THE QUESTION:\n${rulesText}\n\n Answer in ${originalLanguage} based on the retrieved rules only.Be concise (1-4 sentences max).Mention the rule reference and tell the actual cause is based on the rules provided.Do not use your external knowledge.`;
      } else {
         answer = await this.generateAnswerInLanguage(req.query, retrievedRules, originalLanguage, req.context);
      }
      console.log(`[RAG] Step 3 (generate answer): ${Date.now() - startTime}ms`);

      // Step 4: Translate rules - ALL translations in parallel (title + full content)
      // let translatedRules: RetrievedRuleDto[] = [];
      // if (retrievedRules.length > 0 && originalLanguage !== "sv") {
      //    // Flatten all translations into a single Promise.all for max parallelism
      //    const allTranslations = retrievedRules.flatMap((rule) => [
      //       this.embeddingService.translateFromSwedish(rule.title, originalLanguage),
      //       // Full content translation for accuracy (no truncation)
      //       this.embeddingService.translateFromSwedish(rule.content, originalLanguage),
      //    ]);
      //    const results = await Promise.all(allTranslations);

      //    // Rebuild rules from flat results (title at even indices, content at odd)
      //    translatedRules = retrievedRules.map((rule, i) => ({
      //       ...rule,
      //       title: results[i * 2],
      //       content: results[i * 2 + 1],
      //    }));
      // } else {
      //    translatedRules = retrievedRules;
      // }
      // console.log(`[RAG] Step 4 (translate rules): ${Date.now() - startTime}ms`);

      const confidence = this.calculateConfidence(retrievedRules);
      const disclaimer = this.getDisclaimer(retrievedRules.length === 0, originalLanguage);

      console.log(`[RAG] Total time: ${Date.now() - startTime}ms`);

      return {
         answer,
         //  retrievedRules: translatedRules,
         retrievedRules: retrievedRules,
         confidence,
         disclaimer,
      };
   }

   /**
    * Get pre-defined disclaimer in common languages (no API call needed)
    */
   private getDisclaimer(noRulesFound: boolean, language: string): string {
      const disclaimers = {
         noRules: {
            en: "⚠️ WARNING: No matching rules were found in the database. This answer is generated using AI general knowledge and may not be accurate. Please consult the official USGA/R&A Rules of Golf or a rules official for authoritative rulings.",
            sv: "⚠️ VARNING: Inga matchande regler hittades i databasen. Detta svar genereras med hjälp av AI:s allmänna kunskap och kanske inte är korrekt. Vänligen konsultera de officiella USGA/R&A golfreglerna eller en regelofficial för auktoritativa beslut.",
         },
         withRules: {
            en: "This answer is based solely on the retrieved rules. For official rulings, consult a rules official or the USGA/R&A Rules of Golf.",
            sv: "Detta svar baseras enbart på de hämtade reglerna. För officiella beslut, konsultera en regelofficial eller USGA/R&A golfreglerna.",
         },
      };

      const type = noRulesFound ? "noRules" : "withRules";
      return disclaimers[type][language as keyof (typeof disclaimers)[typeof type]] || disclaimers[type].en;
   }

   /**
    * LEGACY: Process a rule query using RAG (original method kept for backward compatibility)
    */
   async queryRulesLegacy(req: RuleQueryRequestDto): Promise<RuleQueryResponseDto> {
      // Detect the original language of the query
      const originalLanguage = await this.embeddingService.detectLanguage(req.query);
      // Translate query to Swedish to match the language of stored golf rules
      const swedishQuery = await this.embeddingService.translateToSwedish(req.query);
      // Retrieve relevant rules (query is already translated to Swedish in RuleRetrieverService)
      const retrievedRules = await this.ruleRetrieverService.retrieveRules(swedishQuery, req.context, req.maxResults);

      let answer: string;

      // If no rules found, generate answer using AI general knowledge
      if (retrievedRules.length === 0) {
         // Generate answer based on AI knowledge (not from retrieved rules)
         const answerInSwedish = await this.generateAnswerWithoutRules(swedishQuery, req.context);
         // Translate answer back to original language
         answer = await this.embeddingService.translateFromSwedish(answerInSwedish, originalLanguage);
      } else {
         // Generate answer using LLM with strict prompting (answer will be in Swedish from rules)
         const answerInSwedish = await this.generateAnswer(req.query, retrievedRules, req.context);
         // Translate answer back to original language
         answer = await this.embeddingService.translateFromSwedish(answerInSwedish, originalLanguage);
      }

      // Translate retrieved rules content back to original language (if any rules found)
      // const translatedRules =
      //    retrievedRules.length > 0
      //       ? await Promise.all(
      //            retrievedRules.map(async (rule) => ({
      //               ...rule,
      //               title: await this.embeddingService.translateFromSwedish(rule.title, originalLanguage),
      //               content: await this.embeddingService.translateFromSwedish(rule.content, originalLanguage),
      //            })),
      //         )
      //       : [];

      // Determine confidence based on similarity scores
      const confidence = this.calculateConfidence(retrievedRules);

      // Translate disclaimer to original language
      // let disclaimer: string;
      // if (retrievedRules.length === 0) {
      //    // No rules found - use disclaimer for AI-generated answer
      //    const disclaimerMessage =
      //       "⚠️ WARNING: No matching rules were found in the database. This answer is generated using AI general knowledge and may not be accurate. Please consult the official USGA/R&A Rules of Golf or a rules official for authoritative rulings.";

      //       if(originalLanguage === "en") {
      //       disclaimer = disclaimerMessage;
      //    } else if(originalLanguage === "sv") {
      //       disclaimer = "⚠️ VARNING: Inga matchande regler hittades i databasen. Detta svar genereras med hjälp av allmän kunskap från AI och är eventuellt inte korrekt. Vänligen kontakta de officiella USGA/R&A:s golfregler eller en regelfunktionär för auktoritativa beslut.";
      //    } else {
      //       disclaimer = await this.embeddingService.translate(disclaimerMessage, "en", originalLanguage);
      //    }
      // } else {
      //    // Rules found - use standard disclaimer
      //    const disclaimerMessage = "This answer is based solely on the retrieved rules. For official rulings, consult a rules official or the USGA/R&A Rules of Golf.";

      //    if(originalLanguage === "en") {
      //       disclaimer = disclaimerMessage;
      //    } else if(originalLanguage === "sv") {
      //       disclaimer = "Detta svar baseras endast på de härliga reglerna. För auktoritativa beslut, kontakta en regelfunktionär eller de officiella USGA/R&A:s golfreglerna.";
      //    } else {
      //       disclaimer = await this.embeddingService.translate(disclaimerMessage, "en", originalLanguage);
      //    }
      // }

      return {
         answer,
         //  retrievedRules: translatedRules,
         retrievedRules: retrievedRules,
         confidence,
         //  disclaimer,
      };
   }

   /**
    * OPTIMIZED: Generate answer directly in target language (saves one translation API call)
    * Uses minimal tokens for faster response
    */
   private async generateAnswerInLanguage(
      query: string,
      rules: RetrievedRuleDto[],
      targetLanguage: string,
      context?: QueryContextDto,
   ): Promise<string> {
      const languageName = this.getLanguageName(targetLanguage);

      // Only include first 500 chars of each rule content to reduce tokens
      const rulesText = rules
         .map((rule, index) => `RULE ${index + 1}: ${rule.title}\n${rule.content.substring(0, 500)}`)
         .join("\n\n");
      const voiceToneInstructions = getVoiceToneInstructions();

      const response = await this.openai.chat.completions.create({
         model: this.model,
         messages: [
            {
               role: "system",
               content: `${getVoiceToneInstructions()}\n\nGolf rules assistant. Answer in ${languageName}. Be concise (1-4 sentences max). Base answer ONLY on provided Swedish rules. Mention the rule reference in the answer for accuracy and tell the actual cause is based on the rules provided.`,
            },
            {
               role: "user",
               content: `Rules:\n${rulesText}\n\nQ: ${query}`,
            },
         ],
         temperature: 0,
         max_tokens: 150,
      });

      return response.choices[0]?.message?.content || "Unable to generate answer.";
   }

   /**
    * OPTIMIZED: Generate answer without rules, directly in target language
    * Minimal tokens for speed
    */
   private async generateAnswerWithoutRulesInLanguage(
      query: string,
      targetLanguage: string,
      _context?: QueryContextDto,
   ): Promise<string> {
      const languageName = this.getLanguageName(targetLanguage);
      const voiceToneInstructions = getVoiceToneInstructions();
      const response = await this.openai.chat.completions.create({
         model: this.model,
         messages: [
            {
               role: "system",
               content: `${getVoiceToneInstructions()}\n\nGolf rules assistant. No rules found in DB. Give brief answer (max 20 words) in ${languageName} based on general golf knowledge.`,
            },
            {
               role: "user",
               content: query,
            },
         ],
         temperature: 0,
         max_tokens: 100,
      });

      return response.choices[0]?.message?.content || "Unable to generate answer.";
   }

   /**
    * Get full language name from ISO code
    */
   private getLanguageName(code: string): string {
      const languages: Record<string, string> = {
         en: "English",
         sv: "Swedish",
         es: "Spanish",
         fr: "French",
         de: "German",
         it: "Italian",
         pt: "Portuguese",
         nl: "Dutch",
         no: "Norwegian",
         da: "Danish",
         fi: "Finnish",
         bn: "Bengali",
         hi: "Hindi",
         ar: "Arabic",
         zh: "Chinese",
         ja: "Japanese",
         ko: "Korean",
         ru: "Russian",
         tr: "Turkish",
         pl: "Polish",
         th: "Thai",
         vi: "Vietnamese",
      };
      return languages[code] || "English";
   }

   /**
    * Generate answer using LLM with strict RAG prompting (when rules are found)
    */
   private async generateAnswer(query: string, rules: RetrievedRuleDto[], context?: QueryContextDto): Promise<string> {
      const systemPrompt = this.buildSystemPrompt();
      const userPrompt = this.buildUserPrompt(query, rules, context);

      const response = await this.openai.chat.completions.create({
         model: this.model,
         messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
         ],
         temperature: 0.1, // Low temperature for deterministic responses
         max_tokens: 500,
      });

      return response.choices[0]?.message?.content || "Unable to generate answer.";
   }

   /**
    * Generate answer using AI general knowledge when no rules are found
    */
   private async generateAnswerWithoutRules(swedishQuery: string, context?: QueryContextDto): Promise<string> {
      let contextText = "";
      if (context) {
         const contextParts: string[] = [];
         if (context.lie) {
            const lieContext = this.getLieContextDescription(context.lie);
            contextParts.push(lieContext);
         }
         if (context.situation) {
            const translatedSituation = await this.embeddingService.translateToSwedish(context.situation);
            contextParts.push(`Situation: ${translatedSituation}`);
         }
         if (contextParts.length > 0) {
            contextText = `\nCONTEXT:\n${contextParts.join("\n")}`;
         }
      }

      const systemPrompt = `You are a golf rules assistant for the iCaddie application.

IMPORTANT: No specific rules were found in the database for this query. You should provide a helpful short answer, max 20 words, based on your general knowledge of golf rules, but you must clearly indicate that this is general information and not from the official rules database.

INSTRUCTIONS:
1. Provide a helpful answer based on your knowledge of golf rules.
2. Clearly state that no matching rules were found in the database.
3. Be accurate and cite general golf rule principles if applicable.
4. Answer in Swedish to maintain consistency with the system.
5. If you are uncertain, say so and recommend consulting official rules.

FORMAT:
- Start by acknowledging that no specific rules were found
- Provide your best answer based on general golf rule knowledge
- Include any relevant general principles
- Be clear that this is not from the official rules database`;

      const userPrompt = `QUESTION: ${swedishQuery}${contextText}

Note: No matching rules were found in the database. Please provide a helpful answer based on your general knowledge of golf rules.`;

      const response = await this.openai.chat.completions.create({
         model: this.model,
         messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
         ],
         temperature: 0.3, // Slightly higher temperature for more natural AI-generated responses
         max_tokens: 500,
      });

      return response.choices[0]?.message?.content || "Unable to generate answer.";
   }

   /**
    * Get descriptive context for lie type (in Swedish to match rule data)
    */
   private getLieContextDescription(lie: LieType | string): string {
      const descriptions: Record<LieType | string, string> = {
         [LieType.TEE]: "Boll på tee, regler för teeområde",
         [LieType.FAIRWAY]: "Boll på fairway, allmänna områdesregler",
         [LieType.ROUGH]: "Boll i rough, regler för svår lie",
         [LieType.BUNKER]: "Boll i bunker, sandfällsregler",
         [LieType.GREEN]: "Boll på green, greenregler",
      };
      return descriptions[lie] || descriptions[String(lie).toLowerCase()] || "";
   }

   /**
    * Build system prompt with strict RAG instructions
    */
   private buildSystemPrompt(): string {
      return `You are a golf rules assistant for the iCaddie application.

CRITICAL INSTRUCTIONS:
1. You MUST answer ONLY using the provided rules below.
2. You MUST NOT invent, assume, or hallucinate any rules.
3. You MUST NOT provide information beyond what is explicitly stated in the provided rules.
4. If the provided rules do not contain enough information to answer the question, say "The provided rules do not contain sufficient information to answer this question."
5. Always cite which rule(s) you are referencing in your answer.
6. Be concise and direct in your response.
7. If asked about something not covered by the provided rules, respond with "This question is not covered by the available rules."
8. IMPORTANT: The rules are in Swedish. Answer in Swedish to match the language of the rules.

FORMAT:
- Start with a direct answer to the question
- Reference the specific rule(s) used
- Include any penalties mentioned in the rules
- Do not add commentary or opinions
- Answer in Swedish`;
   }

   /**
    * Build user prompt with retrieved rules and context
    */
   private buildUserPrompt(query: string, rules: RetrievedRuleDto[], context?: QueryContextDto): string {
      const rulesText = rules
         .map(
            (rule, index) =>
               `RULE ${index + 1}: "${rule.title}"
Category: ${rule.category}
Content: ${rule.content}`,
         )
         .join("\n\n");

      let contextText = "";
      if (context) {
         const contextParts: string[] = [];
         if (context.lie) {
            contextParts.push(`Current lie: ${context.lie}`);
         }
         if (context.situation) {
            contextParts.push(`Situation: ${context.situation}`);
         }
         if (contextParts.length > 0) {
            contextText = `\nCONTEXT:\n${contextParts.join("\n")}`;
         }
      }

      return `AVAILABLE RULES:
${rulesText}
${contextText}

QUESTION: ${query}

Remember: Answer ONLY using the rules provided above. Do not invent or assume any rules.`;
   }

   /**
    * Calculate confidence level based on similarity scores
    */
   private calculateConfidence(rules: RetrievedRuleDto[]): "high" | "medium" | "low" | "none" {
      if (rules.length === 0) return "none";

      const avgScore = rules.reduce((sum, r) => sum + r.similarityScore, 0) / rules.length;

      if (avgScore >= 0.85) return "high";
      if (avgScore >= 0.75) return "medium";
      return "low";
   }
}
