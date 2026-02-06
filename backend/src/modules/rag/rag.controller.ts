import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Get,
  Req,
} from "@nestjs/common";
import { RagService } from "./services/rag.service";
import { RuleIngestionService } from "./services/rule-ingestion.service";
import {
  RuleQueryRequestDto,
  RuleQueryResponseDto,
  RuleQueryRequestSchema,
  RuleIngestionRequestDto,
  RuleIngestionRequestSchema,
  BulkRuleIngestionRequestSchema,
  BulkRuleIngestionRequestDto,
  RuleDocumentDto,
  SeedRulesRequestDto,
  SeedRulesResponseDto,
  BulkIngestionResponseDto,
  HealthResponseDto,
} from "./dto/rule-query.dto";
import { readFileSync } from "fs";
import * as path from "path";
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from "@nestjs/swagger";
import { PrismaService } from "@app/prisma";
import { ApiError } from "@app/common/all-exceptions.filter";

/**
 * RagController - Handles RAG (Retrieval-Augmented Generation) endpoints for golf rules
 * 
 * Uses PrismaService via dependency injection to access the singleton database instance.
 * 
 * Important:
 * - ONE instance is created at application startup
 * - SAME instance is reused for ALL API calls and requests
 * - NO new instances are created per request or per API call
 * - All database operations use the same PrismaService instance across the entire application
 */
@ApiTags("Rules")
@Controller("rules")
export class RagController {
  constructor(
    private readonly ragService: RagService,
    private readonly ruleIngestionService: RuleIngestionService,
    /**
     * PrismaService - Singleton database service instance
     * Injected via dependency injection, ensuring all controllers use the same instance.
     * This is the SAME instance used by all other services, controllers, and repositories.
     * No new instances are created per request or per API call.
     */
    private readonly prisma: PrismaService
  ) { }

  @Post("query")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Query golf rules",
    description:
      "Query golf rules using RAG (Retrieval-Augmented Generation). Submit a natural language question about golf rules and receive an AI-generated answer based on official golf rules.",
  })
  @ApiBody({ type: RuleQueryRequestDto })
  @ApiResponse({
    status: 200,
    description: "Rule query answered successfully",
    type: RuleQueryResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: "Invalid query - validation failed",
  })
  async queryRules(
    @Body() body: unknown,
    @Req() req: Request
  ): Promise<RuleQueryResponseDto> {
    console.log("body__", body);
    const request = RuleQueryRequestSchema.parse(body) as RuleQueryRequestDto;
    return this.ragService.queryRules(request);
  }

  @Post("ingest")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Ingest a single rule",
    description:
      "Add a new golf rule document to the knowledge base. The rule will be embedded and stored for RAG queries.",
  })
  @ApiBody({ type: RuleIngestionRequestDto })
  @ApiResponse({
    status: 201,
    description: "Rule ingested successfully",
    type: RuleDocumentDto,
  })
  @ApiResponse({
    status: 400,
    description: "Invalid rule data - validation failed",
  })
  async ingestRule(@Body() body: unknown): Promise<RuleDocumentDto> {
    const request = RuleIngestionRequestSchema.parse(
      body
    ) as RuleIngestionRequestDto;
    return this.ruleIngestionService.ingestRule(request);
  }

  @Post("ingest/bulk")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Bulk ingest rules",
    description:
      "Add multiple golf rule documents to the knowledge base in a single request.",
  })
  @ApiBody({ type: BulkRuleIngestionRequestDto })
  @ApiResponse({
    status: 201,
    description: "Rules ingested successfully",
    type: BulkIngestionResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: "Invalid rules data - validation failed",
  })
  async ingestRulesBulk(
    @Body() body: unknown
  ): Promise<BulkIngestionResponseDto> {
    const { rules } = BulkRuleIngestionRequestSchema.parse(body);
    const ingested = await this.ruleIngestionService.ingestRules(rules);
    return { count: ingested.length, rules: ingested };
  }



  @Post("load-from-json")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Load rules from JSON files",
    description:
      "Load golf rules from JSON files in the sample_data directory. Useful for importing rules from external sources.",
  })
  @ApiResponse({
    status: 200,
    description: "Rules loaded successfully",
    type: SeedRulesResponseDto,
  })
  async loadFromJson(): Promise<SeedRulesResponseDto> {
    // check if database already seeded or not
    const isSeeded = await this.prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(*) FROM rule_documents
    `;
    if (isSeeded.length > 0 && isSeeded[0].count > 0) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        `Rules already seeded in the database`
      );
    }
    const directoryPath = path.join(
      process.cwd(),
      "sample_data",
      "golf_rules_full_json_3_Dec"
    );
    const result =
      await this.ruleIngestionService.loadRulesFromJsonFiles(directoryPath);
    return {
      message: `Loaded ${result.count} golf rules from JSON files`,
      count: result.count,
    };
  }

  @Get("health")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Health check",
    description: "Check if the RAG (Rules) system is operational.",
  })
  @ApiResponse({
    status: 200,
    description: "System is healthy",
    type: HealthResponseDto,
  })
  async health(): Promise<HealthResponseDto> {
    return { status: "ok" };
  }

  @Get("test-questions")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Get test questions",
    description:
      "Retrieve a list of sample test questions for testing the RAG system.",
  })
  @ApiResponse({
    status: 200,
    description: "Test questions retrieved successfully",
  })
  async testQuestions() {
    const questions = JSON.parse(readFileSync("test_questions.json", "utf8"));
    return questions;
  }
}
