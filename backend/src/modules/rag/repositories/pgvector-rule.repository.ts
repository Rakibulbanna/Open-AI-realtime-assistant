import { Injectable } from "@nestjs/common";
import { PrismaService } from "@app/prisma";
import { IRuleRepository } from "../interfaces/rule-repository.interface";
import { RuleDocumentDto, RetrievedRuleDto } from "../dto/rule-query.dto";

/**
 * PgVectorRuleRepository - Repository for rule documents with vector similarity search
 * 
 * Uses PrismaService via dependency injection to access the singleton database instance.
 * 
 * Important:
 * - ONE instance is created at application startup
 * - SAME instance is reused for ALL database operations
 * - NO new instances are created per request or per API call
 * - All database operations use the same PrismaService instance across the entire application
 */
@Injectable()
export class PgVectorRuleRepository implements IRuleRepository {
   /**
    * PrismaService - Singleton database service instance
    * Injected via dependency injection, ensuring all repositories use the same instance.
    * This is the SAME instance used by all other services, controllers, and repositories.
    * No new instances are created per request or per API call.
    */
   constructor(private readonly prisma: PrismaService) { }

   async save(document: RuleDocumentDto): Promise<RuleDocumentDto> {
      const embeddingStr = document.embedding ? `[${document.embedding.join(",")}]` : null;

      await this.prisma.$executeRaw`
         INSERT INTO rule_documents (id, title, content, category, tags, embedding, metadata, created_at, updated_at)
         VALUES (
            ${document.id}::uuid,
            ${document.title},
            ${document.content},
            ${document.category},
            ${document.tags},
            ${embeddingStr}::vector,
            ${document.metadata ? JSON.stringify(document.metadata) : null}::jsonb,
            NOW(),
            NOW()
         )
         ON CONFLICT (id) DO UPDATE SET
            title = EXCLUDED.title,
            content = EXCLUDED.content,
            category = EXCLUDED.category,
            tags = EXCLUDED.tags,
            embedding = EXCLUDED.embedding,
            metadata = EXCLUDED.metadata,
            updated_at = NOW()
      `;

      return document;
   }

   async saveMany(documents: RuleDocumentDto[]): Promise<RuleDocumentDto[]> {
      for (const doc of documents) {
         await this.save(doc);
      }
      return documents;
   }

   async findSimilar(embedding: number[], limit: number, threshold: number = 0.7): Promise<RetrievedRuleDto[]> {
      const embeddingStr = `[${embedding.join(",")}]`;

      const results = await this.prisma.$queryRaw<
         Array<{
            id: string;
            title: string;
            content: string;
            category: string;
            tags: string[];
            similarity: number;
         }>
      >`
         SELECT 
            id,
            title,
            content,
            category,
            tags,
            1 - (embedding <=> ${embeddingStr}::vector) as similarity
         FROM rule_documents
         WHERE embedding IS NOT NULL
            AND 1 - (embedding <=> ${embeddingStr}::vector) >= ${threshold}
         ORDER BY embedding <=> ${embeddingStr}::vector
         LIMIT ${limit}
      `;

      return results.map((row: {
         id: string;
         title: string;
         content: string;
         category: string;
         tags: string[];
         similarity: number;
      }) => ({
         id: row.id,
         title: row.title,
         content: row.content,
         category: row.category,
         tags: row.tags,
         similarityScore: Number(row.similarity),
      }));
   }

   async findByCategory(category: string): Promise<RuleDocumentDto[]> {
      const results = await this.prisma.$queryRaw<
         Array<{
            id: string;
            title: string;
            content: string;
            category: string;
            tags: string[];
            metadata: Record<string, string> | null;
            created_at: Date;
            updated_at: Date;
         }>
      >`
         SELECT id, title, content, category, tags, metadata, created_at, updated_at
         FROM rule_documents
         WHERE LOWER(category) = LOWER(${category})
      `;

      return results.map((row: {
         id: string;
         title: string;
         content: string;
         category: string;
         tags: string[];
         metadata: Record<string, string> | null;
         created_at: Date;
         updated_at: Date;
      }) => ({
         id: row.id,
         title: row.title,
         content: row.content,
         category: row.category,
         tags: row.tags,
         metadata: row.metadata ?? undefined,
         createdAt: row.created_at,
         updatedAt: row.updated_at,
      }));
   }

   async findByTags(tags: string[]): Promise<RuleDocumentDto[]> {
      const lowerTags = tags.map((t) => t.toLowerCase());

      const results = await this.prisma.$queryRaw<
         Array<{
            id: string;
            title: string;
            content: string;
            category: string;
            tags: string[];
            metadata: Record<string, string> | null;
            created_at: Date;
            updated_at: Date;
         }>
      >`
         SELECT id, title, content, category, tags, metadata, created_at, updated_at
         FROM rule_documents
         WHERE tags && ${lowerTags}::text[]
      `;

      return results.map((row: {
         id: string;
         title: string;
         content: string;
         category: string;
         tags: string[];
         metadata: Record<string, string> | null;
         created_at: Date;
         updated_at: Date;
      }) => ({
         id: row.id,
         title: row.title,
         content: row.content,
         category: row.category,
         tags: row.tags,
         metadata: row.metadata ?? undefined,
         createdAt: row.created_at,
         updatedAt: row.updated_at,
      }));
   }

   async findById(id: string): Promise<RuleDocumentDto | null> {
      const results = await this.prisma.$queryRaw<
         Array<{
            id: string;
            title: string;
            content: string;
            category: string;
            tags: string[];
            metadata: Record<string, string> | null;
            created_at: Date;
            updated_at: Date;
         }>
      >`
         SELECT id, title, content, category, tags, metadata, created_at, updated_at
         FROM rule_documents
         WHERE id = ${id}::uuid
      `;

      if (results.length === 0) return null;

      const row = results[0];
      return {
         id: row.id,
         title: row.title,
         content: row.content,
         category: row.category,
         tags: row.tags,
         metadata: row.metadata ?? undefined,
         createdAt: row.created_at,
         updatedAt: row.updated_at,
      };
   }

   async delete(id: string): Promise<boolean> {
      const result = await this.prisma.$executeRaw`
         DELETE FROM rule_documents WHERE id = ${id}::uuid
      `;
      return result > 0;
   }

   async clear(): Promise<void> {
      await this.prisma.$executeRaw`TRUNCATE TABLE rule_documents`;
   }

   async count(): Promise<number> {
      const result = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
         SELECT COUNT(*) as count FROM rule_documents
      `;
      return Number(result[0].count);
   }
}
