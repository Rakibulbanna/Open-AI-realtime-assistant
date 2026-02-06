import { Injectable, Inject } from "@nestjs/common";
import { EmbeddingService } from "./embedding.service";
import { IRuleRepository, RULE_REPOSITORY_TOKEN } from "../interfaces/rule-repository.interface";
import { QueryContextDto, RetrievedRuleDto } from "../dto/rule-query.dto";
import { LieType } from "../../golf-caddie/dto/shot-recommendation.dto";

@Injectable()
export class RuleRetrieverService {
   // Lowered from 0.65 to 0.55 to capture paraphrased queries better
   private readonly defaultThreshold = 0.55;
   private readonly defaultLimit = 3;

   constructor(
      private readonly embeddingService: EmbeddingService,
      @Inject(RULE_REPOSITORY_TOKEN)
      private readonly ruleRepository: IRuleRepository,
   ) {}

   /**
    * Retrieve relevant rules based on query and context
    */
   async retrieveRules(
    swedishQuery: string, // swedish query
      context?: QueryContextDto,
      limit: number = this.defaultLimit,
   ): Promise<RetrievedRuleDto[]> {
      // Enhance query with context for better semantic matching
      const enhancedQuery = await this.buildEnhancedQuery(swedishQuery, context);

      // Generate embedding for the enhanced query
      const queryEmbedding = await this.embeddingService.generateEmbedding(enhancedQuery);

      // Perform vector similarity search
      const results = await this.ruleRepository.findSimilar(queryEmbedding, limit, this.defaultThreshold);

      // If context includes lie type, boost relevant results
      if (context?.lie) {
         return this.boostByContext(results, context);
      }

      return results;
   }

   /**
    * OPTIMIZED: Retrieve rules with pre-translated Swedish query (skips translation step)
    * Used by the optimized queryRules flow
    */
   async retrieveRulesOptimized(
      swedishQuery: string,
      context?: QueryContextDto,
      limit: number = this.defaultLimit,
   ): Promise<RetrievedRuleDto[]> {
      // Enhance query with context for better semantic matching (query is already in Swedish)
      const enhancedQuery = this.buildEnhancedQuerySync(swedishQuery, context);

      // Generate embedding for the enhanced query
      const queryEmbedding = await this.embeddingService.generateEmbedding(enhancedQuery);

      // Perform vector similarity search
      const results = await this.ruleRepository.findSimilar(queryEmbedding, limit, this.defaultThreshold);

      // If context includes lie type, boost relevant results
      if (context?.lie) {
         return this.boostByContext(results, context);
      }

      return results;
   }

   /**
    * MULTILINGUAL: Uses OpenAI's multilingual embedding model directly
    * No translation needed - the model understands semantics across languages
    * "touch sand" (EN), "vidröra sand" (SV), "বালি স্পর্শ" (BN) → similar vectors
    */
   async retrieveRulesMultilingual(
      originalQuery: string,
      context?: QueryContextDto,
      limit: number = this.defaultLimit,
   ): Promise<RetrievedRuleDto[]> {
      // Generate embedding directly from original language (multilingual model)
      const queryEmbedding = await this.embeddingService.generateEmbedding(originalQuery);

      // Perform vector similarity search against Swedish rules
      // Multilingual embeddings map similar concepts across languages
      const results = await this.ruleRepository.findSimilar(queryEmbedding, limit, this.defaultThreshold);

      // If context includes lie type, boost relevant results
      if (context?.lie) {
         return this.boostByContext(results, context);
      }

      return results;
   }

   /**
    * Synchronous version of buildEnhancedQuery (no translation needed for pre-translated queries)
    */
   private buildEnhancedQuerySync(swedishQuery: string, context?: QueryContextDto): string {
      const parts: string[] = [swedishQuery];

      if (context?.lie) {
         const lieContext = this.getLieContextDescription(context.lie);
         parts.push(lieContext);
      }

      if (context?.situation) {
         // Situation should already be translated or use Swedish context
         parts.push(`Situation: ${context.situation}`);
      }

      return parts.join(" ");
   }

   /**
    * Build enhanced query by incorporating context
    */
   private async buildEnhancedQuery(query: string, context?: QueryContextDto): Promise<string> {
      const parts: string[] = [query];

      if (context?.lie) {
         const lieContext = this.getLieContextDescription(context.lie);
         parts.push(lieContext);
      }

      if (context?.situation) {
         // Translate situation to Swedish to match rule data language
         const translatedSituation = await this.embeddingService.translateToSwedish(context.situation);
         parts.push(`Situation: ${translatedSituation}`);
      }

      return parts.join(" ");
   }

   /**
    * Get descriptive context for lie type (in Swedish to match rule data)
    */
   private getLieContextDescription(lie: LieType): string {
      const descriptions: Record<LieType, string> = {
         [LieType.TEE]: "Boll på tee, regler för teeområde",
         [LieType.FAIRWAY]: "Boll på fairway, allmänna områdesregler",
         [LieType.ROUGH]: "Boll i rough, regler för svår lie",
         [LieType.BUNKER]: "Boll i bunker, sandfällsregler",
         [LieType.GREEN]: "Boll på green, greenregler",
      };
      return descriptions[lie] || "";
   }

   /**
    * Boost results that match the current context
    */
   private boostByContext(results: RetrievedRuleDto[], context: QueryContextDto): RetrievedRuleDto[] {
      if (!context.lie) return results;

      const lieCategory = context.lie.toLowerCase();
      const boostFactor = 0.1;

      return results
         .map((rule) => {
            const categoryMatch = rule.category.toLowerCase() === lieCategory;
            const tagMatch = rule.tags.some((tag) => tag.toLowerCase() === lieCategory);

            const boost = categoryMatch || tagMatch ? boostFactor : 0;

            return {
               ...rule,
               similarityScore: Math.min(1, rule.similarityScore + boost),
            };
         })
         .sort((a, b) => b.similarityScore - a.similarityScore);
   }
}
