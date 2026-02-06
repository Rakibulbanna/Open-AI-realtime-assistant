import { z } from "zod";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { LieType } from "../../golf-caddie/dto/shot-recommendation.dto";

// Query context for situational awareness
export const QueryContextSchema = z.object({
   lie: z.nativeEnum(LieType).optional(),
   situation: z.string().optional(),
   additionalContext: z.record(z.string(), z.string()).optional(),
});

// Rule query request
export const RuleQueryRequestSchema = z.object({
   query: z.string().min(1, "Query is required"),
   context: QueryContextSchema.optional(),
   maxResults: z.number().int().min(1).max(10).default(3),
});

// Rule document structure
export const RuleDocumentSchema = z.object({
   id: z.string(),
   title: z.string(),
   content: z.string(),
   category: z.string(),
   tags: z.array(z.string()),
   embedding: z.array(z.number()).optional(),
   metadata: z.record(z.string(), z.string()).optional(),
   createdAt: z.date().optional(),
   updatedAt: z.date().optional(),
});

// Retrieved rule (without embedding for response)
export const RetrievedRuleSchema = z.object({
   id: z.string(),
   title: z.string(),
   content: z.string(),
   category: z.string(),
   tags: z.array(z.string()),
   similarityScore: z.number(),
});

// RAG response
export const RuleQueryResponseSchema = z.object({
   answer: z.string(),
   retrievedRules: z.array(RetrievedRuleSchema),
   confidence: z.enum(["high", "medium", "low", "none"]),
   disclaimer: z.string().optional(),
});

// Rule ingestion request
export const RuleIngestionRequestSchema = z.object({
   title: z.string().min(1),
   content: z.string().min(1),
   category: z.string().min(1),
   tags: z.array(z.string()),
   metadata: z.record(z.string(), z.string()).optional(),
});

export const BulkRuleIngestionRequestSchema = z.object({
   rules: z.array(RuleIngestionRequestSchema),
});

// Swagger DTO Classes
export class QueryContextDto {
   @ApiPropertyOptional({ description: "Current lie type", enum: LieType, example: LieType.BUNKER })
   lie?: LieType;

   @ApiPropertyOptional({ description: "Situation description", example: "Ball landed in water hazard" })
   situation?: string;

   @ApiPropertyOptional({
      description: "Additional context as key-value pairs",
      example: { weather: "rainy", tournament: "casual" },
   })
   additionalContext?: Record<string, string>;
}

export class RuleQueryRequestDto {
   @ApiProperty({
      description: "The golf rules question to ask",
      example: "Can I touch the sand before my stroke in a bunker?",
   })
   query: string;

   @ApiPropertyOptional({ description: "Optional context for the query", type: QueryContextDto })
   context?: QueryContextDto;

   @ApiPropertyOptional({
      description: "Maximum number of relevant rules to retrieve (1-10)",
      minimum: 1,
      maximum: 10,
      default: 3,
      example: 3,
   })
   maxResults?: number;


   @ApiPropertyOptional({ description: "Whether to apply webRTC query", default: false, example: false })
   isWebRTCQuery?: boolean;
}

export class RetrievedRuleDto {
   @ApiProperty({ description: "Unique identifier of the rule", example: "rule-12-2b" })
   id: string;

   @ApiProperty({ description: "Rule title", example: "Touching Sand in Bunker" })
   title: string;

   @ApiProperty({
      description: "Full rule content",
      example: "A player must not touch the sand in a bunker with their hand, club, or rake...",
   })
   content: string;

   @ApiProperty({ description: "Rule category", example: "Bunker Play" })
   category: string;

   @ApiProperty({ description: "Tags associated with the rule", example: ["bunker", "sand", "penalty"] })
   tags: string[];

   @ApiProperty({ description: "Similarity score from vector search (0-1)", example: 0.92 })
   similarityScore: number;
}

export class RuleQueryResponseDto {
   @ApiProperty({
      description: "AI-generated answer based on retrieved rules",
      example:
         "No, you cannot touch the sand before making your stroke in a bunker. According to Rule 12.2b, a player must not touch the sand with their hand, club, rake, or other object to test conditions or improve their lie.",
   })
   answer: string;

   @ApiProperty({ description: "List of relevant rules retrieved", type: [RetrievedRuleDto] })
   retrievedRules: RetrievedRuleDto[];

   @ApiProperty({
      description: "Confidence level of the answer",
      enum: ["high", "medium", "low", "none"],
      example: "high",
   })
   confidence: "high" | "medium" | "low" | "none";

   @ApiPropertyOptional({
      description: "Optional disclaimer about the answer",
      example: "This information is for reference only. Consult an official rules official for tournament play.",
   })
   disclaimer?: string;
}

export class RuleIngestionRequestDto {
   @ApiProperty({ description: "Rule title", example: "Touching Sand in Bunker" })
   title: string;

   @ApiProperty({
      description: "Full rule content",
      example: "A player must not touch the sand in a bunker with their hand, club, or rake...",
   })
   content: string;

   @ApiProperty({ description: "Rule category", example: "Bunker Play" })
   category: string;

   @ApiProperty({ description: "Tags for the rule", example: ["bunker", "sand", "penalty"] })
   tags: string[];

   @ApiPropertyOptional({
      description: "Additional metadata",
      example: { ruleNumber: "12.2b", effectiveDate: "2023-01-01" },
   })
   metadata?: Record<string, string>;
}

export class BulkRuleIngestionRequestDto {
   @ApiProperty({ description: "Array of rules to ingest", type: [RuleIngestionRequestDto] })
   rules: RuleIngestionRequestDto[];
}

export class RuleDocumentDto {
   @ApiProperty({ description: "Unique identifier", example: "uuid-12345" })
   id: string;

   @ApiProperty({ description: "Rule title", example: "Touching Sand in Bunker" })
   title: string;

   @ApiProperty({ description: "Rule content", example: "A player must not touch the sand..." })
   content: string;

   @ApiProperty({ description: "Rule category", example: "Bunker Play" })
   category: string;

   @ApiProperty({ description: "Tags", example: ["bunker", "sand"] })
   tags: string[];

   @ApiPropertyOptional({ description: "Vector embedding (not returned in responses)" })
   embedding?: number[];

   @ApiPropertyOptional({ description: "Additional metadata" })
   metadata?: Record<string, string>;

   @ApiPropertyOptional({ description: "Creation timestamp" })
   createdAt?: Date;

   @ApiPropertyOptional({ description: "Last update timestamp" })
   updatedAt?: Date;
}

export class SeedRulesRequestDto {
   @ApiPropertyOptional({
      description: "Force reload even if rules already exist",
      default: false,
      example: false,
   })
   forceReload?: boolean;
}

export class SeedRulesResponseDto {
   @ApiProperty({ description: "Result message", example: "Seeded 150 golf rules" })
   message: string;

   @ApiProperty({ description: "Number of rules processed", example: 150 })
   count: number;
}

export class BulkIngestionResponseDto {
   @ApiProperty({ description: "Number of rules ingested", example: 10 })
   count: number;

   @ApiProperty({ description: "Ingested rule documents", type: [RuleDocumentDto] })
   rules: RuleDocumentDto[];
}

export class HealthResponseDto {
   @ApiProperty({ description: "Health status", example: "ok" })
   status: string;
}
