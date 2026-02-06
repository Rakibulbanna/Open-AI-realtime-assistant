import { RuleDocumentDto, RetrievedRuleDto } from "../dto/rule-query.dto";

export interface IRuleRepository {
   /**
    * Store a rule document with its embedding
    */
   save(document: RuleDocumentDto): Promise<RuleDocumentDto>;

   /**
    * Store multiple rule documents
    */
   saveMany(documents: RuleDocumentDto[]): Promise<RuleDocumentDto[]>;

   /**
    * Find rules by vector similarity search
    * @param embedding Query embedding vector
    * @param limit Maximum number of results
    * @param threshold Minimum similarity threshold (0-1)
    */
   findSimilar(embedding: number[], limit: number, threshold?: number): Promise<RetrievedRuleDto[]>;

   /**
    * Find rules by category
    */
   findByCategory(category: string): Promise<RuleDocumentDto[]>;

   /**
    * Find rules by tags
    */
   findByTags(tags: string[]): Promise<RuleDocumentDto[]>;

   /**
    * Get rule by ID
    */
   findById(id: string): Promise<RuleDocumentDto | null>;

   /**
    * Delete rule by ID
    */
   delete(id: string): Promise<boolean>;

   /**
    * Clear all rules
    */
   clear(): Promise<void>;

   /**
    * Get total count of rules
    */
   count(): Promise<number>;
}

export const RULE_REPOSITORY_TOKEN = Symbol("IRuleRepository");
