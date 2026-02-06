import { Module } from "@nestjs/common";
import { RagController } from "./rag.controller";
import { RagService } from "./services/rag.service";
import { EmbeddingService } from "./services/embedding.service";
import { RuleIngestionService } from "./services/rule-ingestion.service";
import { RuleRetrieverService } from "./services/rule-retriever.service";
import { PgVectorRuleRepository } from "./repositories/pgvector-rule.repository";
import { RULE_REPOSITORY_TOKEN } from "./interfaces/rule-repository.interface";
import { PrismaModule } from "@app/prisma";

@Module({
   imports: [PrismaModule],
   controllers: [RagController],
   providers: [
      RagService,
      EmbeddingService,
      RuleIngestionService,
      RuleRetrieverService,

      {
         provide: RULE_REPOSITORY_TOKEN,
         useClass: PgVectorRuleRepository,
      },
   ],
   exports: [RagService, RuleRetrieverService, EmbeddingService,],
})
export class RagModule { }
