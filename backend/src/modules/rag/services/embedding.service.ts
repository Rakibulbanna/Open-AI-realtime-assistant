import { Injectable } from "@nestjs/common";
import OpenAI from "openai";

@Injectable()
export class EmbeddingService {
   private readonly openai: OpenAI;
   private readonly model = "text-embedding-3-small";
   private readonly dimensions = 1536;

   constructor() {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
         throw new Error("OPENAI_API_KEY environment variable is not set");
      }
      this.openai = new OpenAI({ apiKey });
   }

   /**
    * Generate embedding for a single text
    */
   async generateEmbedding(text: string): Promise<number[]> {
      const response = await this.openai.embeddings.create({
         model: this.model,
         input: text,
         dimensions: this.dimensions,
      });
      return response.data[0].embedding;
   }

   /**
    * Generate embeddings for multiple texts (batch)
    */
   async generateEmbeddings(texts: string[]): Promise<number[][]> {
      if (texts.length === 0) return [];

      const response = await this.openai.embeddings.create({
         model: this.model,
         input: texts,
         dimensions: this.dimensions,
      });

      return response.data.sort((a, b) => a.index - b.index).map((item) => item.embedding);
   }

   /**
    * Detect the language of a text
    */
   async detectLanguage(text: string): Promise<string> {
      try {
         const response = await this.openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
               {
                  role: "system",
                  content:
                     "You are a language detection assistant. Detect the language of the given text and return only the ISO 639-1 language code (e.g., 'en', 'sv', 'es', 'fr', 'de'). If the text is Swedish, return 'sv'. Return only the two-letter code, nothing else.",
               },
               {
                  role: "user",
                  content: text,
               },
            ],
            temperature: 0.1,
            max_tokens: 10,
         });

         const detected = response.choices[0]?.message?.content?.trim().toLowerCase() || "en";
         return detected;
      } catch (error) {
         console.error("Language detection error, defaulting to English:", error);
         return "en";
      }
   }

   /**
    * OPTIMIZED: Detect language and translate to Swedish in a single API call
    * Saves ~0.5s by combining two operations
    */
   async detectAndTranslateToSwedish(text: string): Promise<{ language: string; swedish: string }> {
      try {
         const response = await this.openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
               {
                  role: "system",
                  content: `You are a language detection and translation assistant.
1. Detect the language of the input text
2. Translate it to Swedish (if already Swedish, keep as-is)
Return ONLY a JSON object in this exact format: {"language": "xx", "swedish": "translated text"}
where "xx" is the ISO 639-1 language code (en, sv, es, fr, de, etc.)`,
               },
               {
                  role: "user",
                  content: text,
               },
            ],
            response_format: { type: "json_object" },
            temperature: 0.1,
            max_tokens: 600,
         });

         const result = JSON.parse(response.choices[0]?.message?.content || "{}");
         return {
            language: result.language?.toLowerCase() || "en",
            swedish: result.swedish || text,
         };
      } catch (error) {
         console.error("Detect and translate error:", error);
         return { language: "en", swedish: text };
      }
   }

   /**
    * Translate text to Swedish using OpenAI
    * For non-European languages (Bengali, Hindi, Arabic, etc.), translate via English for accuracy
    */
   async translateToSwedish(text: string): Promise<string> {
      try {
         const response = await this.openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
               {
                  role: "system",
                  content:
                     "Translate the text to Swedish. For non-European languages (Bengali, Hindi, Arabic, Chinese, Japanese, Korean, etc.), first understand the meaning in English, then translate to Swedish for accuracy. Only return the Swedish translation, nothing else.",
               },
               {
                  role: "user",
                  content: text,
               },
            ],
            temperature: 0.1,
            max_tokens: 500,
         });

         return response.choices[0]?.message?.content?.trim() || text;
      } catch (error) {
         console.error("Translation error, using original text:", error);
         return text;
      }
   }

   /**
    * Translate text from Swedish to target language
    */
   async translateFromSwedish(text: string, targetLanguage: string): Promise<string> {
      // If target is Swedish, return as-is
      if (targetLanguage === "sv" || targetLanguage.toLowerCase() === "swedish") {
         return text;
      }

      try {
         const response = await this.openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
               {
                  role: "system",
                  content: `You are a translation assistant. Translate the given Swedish text to ${targetLanguage}. Only return the translated text, no explanations or additional text. Preserve the meaning and structure exactly.`,
               },
               {
                  role: "user",
                  content: text,
               },
            ],
            temperature: 0.1,
            max_tokens: 1000,
         });

         return response.choices[0]?.message?.content?.trim() || text;
      } catch (error) {
         console.error("Translation error, using original text:", error);
         return text;
      }
   }

   /**
    * Translate text from source language to target language
    */
   async translate(text: string, sourceLanguage: string, targetLanguage: string): Promise<string> {
      // If source and target are the same, return as-is
      if (sourceLanguage === targetLanguage) {
         return text;
      }

      try {
         const response = await this.openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
               {
                  role: "system",
                  content: `You are a translation assistant. Translate the given text from ${sourceLanguage} to ${targetLanguage}. Only return the translated text, no explanations or additional text. Preserve the meaning and structure exactly.`,
               },
               {
                  role: "user",
                  content: text,
               },
            ],
            temperature: 0.1,
            max_tokens: 1000,
         });

         return response.choices[0]?.message?.content?.trim() || text;
      } catch (error) {
         console.error("Translation error, using original text:", error);
         return text;
      }
   }

   /**
    * OPTIMIZED: Batch translate multiple texts in a single API call
    * Much faster than translating one by one
    */
   async batchTranslateFromSwedish(
      texts: { id: string; text: string }[],
      targetLanguage: string,
   ): Promise<Map<string, string>> {
      // If target is Swedish, return as-is
      if (targetLanguage === "sv" || targetLanguage.toLowerCase() === "swedish") {
         const result = new Map<string, string>();
         texts.forEach((t) => result.set(t.id, t.text));
         return result;
      }

      // If no texts, return empty map
      if (texts.length === 0) {
         return new Map();
      }

      try {
         const textsForTranslation = texts.map((t) => `[${t.id}]: ${t.text}`).join("\n---\n");

         const response = await this.openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
               {
                  role: "system",
                  content: `You are a translation assistant. Translate each Swedish text to ${targetLanguage}.
Return a JSON object where keys are the IDs and values are translations.
Example input:
[id1]: Swedish text 1
---
[id2]: Swedish text 2

Example output: {"id1": "Translated text 1", "id2": "Translated text 2"}`,
               },
               {
                  role: "user",
                  content: textsForTranslation,
               },
            ],
            response_format: { type: "json_object" },
            temperature: 0.1,
            max_tokens: 3000,
         });

         const result = JSON.parse(response.choices[0]?.message?.content || "{}");
         const resultMap = new Map<string, string>();
         texts.forEach((t) => resultMap.set(t.id, result[t.id] || t.text));
         return resultMap;
      } catch (error) {
         console.error("Batch translation error:", error);
         // Return original texts on error
         const result = new Map<string, string>();
         texts.forEach((t) => result.set(t.id, t.text));
         return result;
      }
   }

   /**
    * Calculate cosine similarity between two vectors
    */
   cosineSimilarity(vecA: number[], vecB: number[]): number {
      if (vecA.length !== vecB.length) {
         throw new Error("Vectors must have the same length");
      }

      let dotProduct = 0;
      let normA = 0;
      let normB = 0;

      for (let i = 0; i < vecA.length; i++) {
         dotProduct += vecA[i] * vecB[i];
         normA += vecA[i] * vecA[i];
         normB += vecB[i] * vecB[i];
      }

      const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
      if (magnitude === 0) return 0;

      return dotProduct / magnitude;
   }
}
