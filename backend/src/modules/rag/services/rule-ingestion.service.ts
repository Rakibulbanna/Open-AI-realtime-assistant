import { Injectable, Inject } from "@nestjs/common";
import { v4 as uuidv4 } from "uuid";
import { EmbeddingService } from "./embedding.service";
import { IRuleRepository, RULE_REPOSITORY_TOKEN } from "../interfaces/rule-repository.interface";
import { RuleDocumentDto, RuleIngestionRequestDto } from "../dto/rule-query.dto";
import { loadGolfRulesFromJsonFiles } from "../utils/golf-rule-parser";

@Injectable()
export class RuleIngestionService {
   constructor(
      private readonly embeddingService: EmbeddingService,
      @Inject(RULE_REPOSITORY_TOKEN)
      private readonly ruleRepository: IRuleRepository,
   ) { }

   /**
    * Ingest a single rule document
    */
   async ingestRule(request: RuleIngestionRequestDto): Promise<RuleDocumentDto> {
      // Generate embedding from title + content for better semantic search
      const textForEmbedding = `${request.title}\n\n${request.content}`;
      const embedding = await this.embeddingService.generateEmbedding(textForEmbedding);

      const document: RuleDocumentDto = {
         id: uuidv4(),
         title: request.title,
         content: request.content,
         category: request.category,
         tags: request.tags,
         embedding,
         metadata: request.metadata,
         createdAt: new Date(),
         updatedAt: new Date(),
      };

      return this.ruleRepository.save(document);
   }

   /**
    * Ingest multiple rule documents (batch)
    */
   async ingestRules(requests: RuleIngestionRequestDto[]): Promise<RuleDocumentDto[]> {
      // Generate embeddings in batch for efficiency
      const textsForEmbedding = requests.map((r) => `${r.title}\n\n${r.content}`);
      const embeddings = await this.embeddingService.generateEmbeddings(textsForEmbedding);

      const documents: RuleDocumentDto[] = requests.map((request, index) => ({
         id: uuidv4(),
         title: request.title,
         content: request.content,
         category: request.category,
         tags: request.tags,
         embedding: embeddings[index],
         metadata: request.metadata,
         createdAt: new Date(),
         updatedAt: new Date(),
      }));

      return this.ruleRepository.saveMany(documents);
   }

   /**
    * Load and ingest golf rules from JSON files directory
    */
   async loadRulesFromJsonFiles(directoryPath: string): Promise<{ count: number }> {
      const rules = loadGolfRulesFromJsonFiles(directoryPath);
      await this.ingestRules(rules);
      return { count: rules.length };
   }
}
