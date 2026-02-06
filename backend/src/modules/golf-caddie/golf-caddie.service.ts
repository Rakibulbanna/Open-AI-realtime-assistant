import { Injectable } from "@nestjs/common";
import {
   ShotRecommendationRequestDto,
   ShotRecommendationResponseDto,
   RecommendedClubDto,
   ContextSummaryDto,
   LieType,
   FairwayWidth,
   WindImpact,
   RiskLevel,
   SuggestShotsRequestDto,
   SuggestShotsResponseDto,
} from "./dto/shot-recommendation.dto";
import { calculateDistance } from "./utils/distance.util";
import { calculateWindImpact, calculateWindPenalty } from "./utils/wind.util";
import { calculateShotDirection } from "./utils/shot-direction.util";
import OpenAI, { toFile } from "openai";
import fs from "fs";
import { getVoiceForPersonality, getVoiceToneInstructions } from "./utils/assistant-utils";
type ClubName = "Driver" | "3Wood" | "5Iron" | "7Iron" | "9Iron" | "PW" | "SW";

interface ClubOption {
   club: ClubName;
   baseDistance: number;
   adjustedDistance: number;
   successProbability: number;
   reason: string;
}

@Injectable()
export class GolfCaddieService {
   private readonly openai: OpenAI;
   private readonly fastApiAddress: string;
   constructor() {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
         throw new Error("OPENAI_API_KEY environment variable is not set");
      }

      this.openai = new OpenAI({
         apiKey: apiKey,
      });
      this.fastApiAddress = process.env.FAST_API_ADDRESS || "http://localhost:8001";
   }

   async convertSpeechToText(audioBuffer: Buffer, mimeType?: string): Promise<string> {
      try {
         // Determine file extension from mimeType
         const getFileExtension = (mime: string | undefined): string => {
            if (!mime) return "mp3";
            if (mime.includes("mp4")) return "mp4";
            if (mime.includes("mp3")) return "mp3";
            if (mime.includes("wav")) return "wav";
            if (mime.includes("webm")) return "webm";
            if (mime.includes("m4a")) return "m4a";
            if (mime.includes("ogg")) return "ogg";
            return "mp3"; // default
         };

         const extension = getFileExtension(mimeType);
         const filename = `audio.${extension}`;

         // Convert buffer to File using OpenAI's toFile helper (works in Node.js)
         const file = await toFile(audioBuffer, filename, {
            type: mimeType || "audio/mpeg",
         });

         const transcription = await this.openai.audio.transcriptions.create({
            file: file,
            model: "whisper-1",
            // language: "en",
         });

         return transcription.text;
      } catch (error) {
         throw new Error(`Failed to convert speech to text: ${error.message}`);
      }
   }
   /**
    * Convert text to speech using OpenAI TTS.
    *
    * @param text - The text content to synthesize
    * @param personality - Optional personality label that is mapped to a specific TTS voice
    */
   async convertTextToSpeech(text: string, personality?: string, is_system_prompt_applied = true): Promise<Buffer> {
      try {
         const query: { instructions?: string } = {};
         if (is_system_prompt_applied) {
            query.instructions = getVoiceToneInstructions();
         }
         const voice = getVoiceForPersonality(personality);
         console.log("voice___", voice);

         const response = await this.openai.audio.speech.create({
            // model: "tts-1",
            model: "gpt-4o-mini-tts-2025-12-15",
            input: text,
            voice,
            ...query,
            response_format: "mp3",
         });
         return Buffer.from(await response.arrayBuffer());
      } catch (error) {
         console.log(error);
         throw new Error(`Failed to convert text to speech: ${error.message}`);
      }
   }
   getVoiceForPersonality = (personalityName?: string): string => {
      if (!personalityName) {
         return "alloy";
      }

      const normalized = personalityName.trim().toLowerCase();

      // Valid OpenAI TTS voices (as per OpenAI API specification)
      const validVoices = [
         "alloy",
         "ash",
         "coral",
         "echo",
         "fable",
         "nova",
         "onyx",
         "sage",
         "shimmer",
         "ballad",
         "verse",
         "marin",
         "cedar",
      ];

      // Explicit mappings for personality names
      const personalityMappings: Record<string, string> = {
         "gordon ramsay": "ash",
         "anika svensson": "marin",
      };

      if (personalityMappings[normalized]) {
         return personalityMappings[normalized];
      }

      const matchedVoice = validVoices.find((voice) => voice === normalized);
      if (matchedVoice) {
         return matchedVoice;
      }

      return "alloy";
   };
   recommendClubs(req: ShotRecommendationRequestDto): ShotRecommendationResponseDto {
      // Green requires putter only
      if (req.lie === LieType.GREEN) {
         return {
            recommendedClubs: [
               {
                  type: "SAFE",
                  club: "Putter",
                  expectedDistance_m: 0,
                  successProbability_pct: 95,
                  reason: "on green, putter required",
               },
               {
                  type: "AGGRESSIVE",
                  club: "Putter",
                  expectedDistance_m: 0,
                  successProbability_pct: 95,
                  reason: "on green, putter required",
               },
            ],
            contextSummary: {
               distanceToHole_m: Math.round(
                  calculateDistance(
                     req.playerPosition.lat,
                     req.playerPosition.lng,
                     req.holePosition.lat,
                     req.holePosition.lng,
                  ),
               ),
               lie: req.lie,
               windImpact: WindImpact.LOW,
               riskLevel: RiskLevel.LOW,
            },
         };
      }

      const distanceToHole = calculateDistance(
         req.playerPosition.lat,
         req.playerPosition.lng,
         req.holePosition.lat,
         req.holePosition.lng,
      );

      const shotDirection = calculateShotDirection(req.playerPosition, req.holePosition);

      const windImpact = calculateWindImpact(req.wind.speed_mps, req.wind.direction_deg, shotDirection);

      const windPenalty = calculateWindPenalty(req.wind.speed_mps, req.wind.direction_deg, shotDirection);

      const validClubs = this.getValidClubsForLie(req.lie);

      const clubOptions: ClubOption[] = validClubs.map((club) => {
         const baseDistance = req.playerProfile.clubDistances[club as keyof typeof req.playerProfile.clubDistances];
         const adjustedDistance = baseDistance * windImpact.distanceMultiplier;

         const successProbability = this.calculateSuccessProbability(
            req,
            club,
            baseDistance,
            adjustedDistance,
            distanceToHole,
            windPenalty,
            windImpact.impactLevel,
         );

         const reason = this.generateReason(req, club, adjustedDistance, distanceToHole, windImpact.impactLevel);

         return {
            club,
            baseDistance,
            adjustedDistance,
            successProbability,
            reason,
         };
      });

      if (clubOptions.length === 0) {
         throw new Error("No valid clubs available for this lie");
      }

      const { safe, aggressive } = this.selectOptions(clubOptions, distanceToHole);

      const riskLevel = this.determineRiskLevel(req, distanceToHole, windImpact.impactLevel);

      return {
         recommendedClubs: [
            {
               type: "SAFE",
               club: safe.club,
               expectedDistance_m: Math.round(safe.adjustedDistance),
               successProbability_pct: Math.round(safe.successProbability),
               reason: safe.reason,
            },
            {
               type: "AGGRESSIVE",
               club: aggressive.club,
               expectedDistance_m: Math.round(aggressive.adjustedDistance),
               successProbability_pct: Math.round(aggressive.successProbability),
               reason: aggressive.reason,
            },
         ],
         contextSummary: {
            distanceToHole_m: Math.round(distanceToHole),
            lie: req.lie,
            windImpact: windImpact.impactLevel,
            riskLevel,
         },
      };
   }

   /**
    * Get valid clubs based on lie type (GOLF RULES)
    */
   private getValidClubsForLie(lie: LieType): ClubName[] {
      switch (lie) {
         case LieType.TEE:
            // Tee allows Driver and Woods
            return ["Driver", "3Wood", "5Iron", "7Iron", "9Iron", "PW", "SW"];

         case LieType.FAIRWAY:
            // Fairway allows all clubs
            return ["Driver", "3Wood", "5Iron", "7Iron", "9Iron", "PW", "SW"];

         case LieType.ROUGH:
            // Rough: long clubs become risky, but all technically allowed
            // Prefer shorter clubs
            return ["5Iron", "7Iron", "9Iron", "PW", "SW"];

         case LieType.BUNKER:
            // BUNKER RULE: Only Sand Wedge and Pitching Wedge allowed
            return ["SW", "PW"];

         case LieType.GREEN:
            // Green: Only putter (not in our club list, so return empty)
            // This case should be handled separately
            return [];

         default:
            return [];
      }
   }

   /**
    * Calculate success probability for a club
    */
   private calculateSuccessProbability(
      request: ShotRecommendationRequestDto,
      club: ClubName,
      baseDistance: number,
      adjustedDistance: number,
      distanceToHole: number,
      windPenalty: number,
      windImpactLevel: WindImpact,
   ): number {
      // Base success from player skill (handicap)
      // Lower handicap = higher skill = higher base success
      const handicap = request.playerProfile.handicap;
      let baseSuccess = 85 - handicap * 1.5; // 85% for scratch, decreases with handicap
      baseSuccess = Math.max(30, Math.min(95, baseSuccess)); // Clamp between 30-95%

      // Lie penalties
      let liePenalty = 0;
      switch (request.lie) {
         case LieType.TEE:
            liePenalty = 0; // No penalty on tee
            break;
         case LieType.FAIRWAY:
            liePenalty = 0; // No penalty on fairway
            break;
         case LieType.ROUGH:
            liePenalty = 15; // Medium penalty for rough
            // Additional penalty for long clubs in rough
            if (club === "Driver" || club === "3Wood") {
               liePenalty += 10;
            }
            break;
         case LieType.BUNKER:
            liePenalty = 25; // High penalty for bunker
            break;
         case LieType.GREEN:
            liePenalty = 0;
            break;
      }

      // Wind penalty (always reduces success)
      const totalWindPenalty = windPenalty;

      // Distance accuracy penalty
      // If the club's adjusted distance is far from target, reduce success
      const distanceDifference = Math.abs(adjustedDistance - distanceToHole);
      const distanceAccuracyPenalty = Math.min(20, distanceDifference / 10); // Up to 20% penalty

      // Long club risk penalty
      let longClubPenalty = 0;
      if (club === "Driver") {
         longClubPenalty = 8;
      } else if (club === "3Wood") {
         longClubPenalty = 5;
      }

      // Narrow fairway penalty
      let fairwayPenalty = 0;
      if (request.obstacles.fairwayWidth === FairwayWidth.NARROW) {
         fairwayPenalty = 5;
      } else if (request.obstacles.fairwayWidth === FairwayWidth.MEDIUM) {
         fairwayPenalty = 2;
      }

      // Bunker in line of play penalty
      let bunkerPenalty = 0;
      if (request.obstacles.bunkersInLineOfPlay) {
         // If shot must carry bunker, higher penalty
         if (adjustedDistance > distanceToHole * 0.8) {
            bunkerPenalty = 8;
         } else {
            bunkerPenalty = 3; // Safer shot that lands before bunker
         }
      }

      // Calculate final probability
      let finalProbability =
         baseSuccess -
         liePenalty -
         totalWindPenalty -
         distanceAccuracyPenalty -
         longClubPenalty -
         fairwayPenalty -
         bunkerPenalty;

      // Clamp between 0 and 100
      finalProbability = Math.max(0, Math.min(100, finalProbability));

      return finalProbability;
   }

   /**
    * Select SAFE and AGGRESSIVE options
    */
   private selectOptions(
      clubOptions: ClubOption[],
      distanceToHole: number,
   ): { safe: ClubOption; aggressive: ClubOption } {
      // Sort by success probability (descending)
      const sortedByProbability = [...clubOptions].sort((a, b) => b.successProbability - a.successProbability);

      // SAFE option: highest probability
      const safe = sortedByProbability[0];

      // AGGRESSIVE option: longer club or one that gets closer to hole
      // Find club that gets closest to hole distance while still being reasonable
      const sortedByDistanceMatch = [...clubOptions].sort((a, b) => {
         const aDiff = Math.abs(a.adjustedDistance - distanceToHole);
         const bDiff = Math.abs(b.adjustedDistance - distanceToHole);
         return aDiff - bDiff;
      });

      // AGGRESSIVE: prefer longer club that gets closer to hole
      // But if only one option exists, use it for both
      if (clubOptions.length === 1) {
         return { safe, aggressive: safe };
      }

      // Find aggressive option: longer club that's closer to target distance
      let aggressive = sortedByDistanceMatch[0];

      // If safe is also the best distance match, find next best option
      if (aggressive.club === safe.club && clubOptions.length > 1) {
         aggressive = sortedByDistanceMatch[1] || sortedByProbability[1];
      }

      // Prefer longer clubs for aggressive if they're reasonably close
      const longerOptions = clubOptions.filter(
         (opt) => opt.adjustedDistance > safe.adjustedDistance && opt.adjustedDistance <= distanceToHole * 1.2,
      );

      if (longerOptions.length > 0) {
         const bestLonger = longerOptions.sort((a, b) => b.successProbability - a.successProbability)[0];
         if (bestLonger.successProbability >= aggressive.successProbability - 10) {
            aggressive = bestLonger;
         }
      }

      return { safe, aggressive };
   }

   /**
    * Generate reason for club recommendation
    */
   private generateReason(
      request: ShotRecommendationRequestDto,
      club: ClubName,
      adjustedDistance: number,
      distanceToHole: number,
      windImpactLevel: WindImpact,
   ): string {
      const reasons: string[] = [];

      // Distance reason
      const distanceDiff = adjustedDistance - distanceToHole;
      if (Math.abs(distanceDiff) < 10) {
         reasons.push("perfect distance match");
      } else if (distanceDiff > 0) {
         reasons.push(`covers ${Math.round(distanceDiff)}m beyond target`);
      } else {
         reasons.push(`falls ${Math.round(Math.abs(distanceDiff))}m short of target`);
      }

      // Lie reason
      switch (request.lie) {
         case LieType.TEE:
            reasons.push("optimal lie from tee");
            break;
         case LieType.FAIRWAY:
            reasons.push("good control from fairway");
            break;
         case LieType.ROUGH:
            reasons.push("handles rough conditions");
            break;
         case LieType.BUNKER:
            reasons.push("required for bunker escape");
            break;
      }

      // Wind reason
      if (windImpactLevel === "high") {
         reasons.push("accounts for strong wind");
      } else if (windImpactLevel === "medium") {
         reasons.push("wind-adjusted");
      }

      // Obstacle reason
      if (request.obstacles.bunkersInLineOfPlay) {
         if (adjustedDistance < distanceToHole * 0.8) {
            reasons.push("lands safely before bunker");
         } else {
            reasons.push("carries bunker in play");
         }
      }

      return reasons.join(", ");
   }

   /**
    * Determine overall risk level
    */
   private determineRiskLevel(
      request: ShotRecommendationRequestDto,
      distanceToHole: number,
      windImpactLevel: WindImpact,
   ): RiskLevel {
      let riskFactors = 0;

      // Lie risk
      if (request.lie === LieType.BUNKER) {
         riskFactors += 3;
      } else if (request.lie === LieType.ROUGH) {
         riskFactors += 1;
      }

      // Wind risk
      if (windImpactLevel === "high") {
         riskFactors += 2;
      } else if (windImpactLevel === "medium") {
         riskFactors += 1;
      }

      // Obstacle risk
      if (request.obstacles.bunkersInLineOfPlay) {
         riskFactors += 1;
      }

      if (request.obstacles.fairwayWidth === FairwayWidth.NARROW) {
         riskFactors += 1;
      }

      // Distance risk (very long shots are riskier)
      if (distanceToHole > 200) {
         riskFactors += 1;
      }

      if (riskFactors >= 4) {
         return RiskLevel.HIGH;
      } else if (riskFactors >= 2) {
         return RiskLevel.MEDIUM;
      } else {
         return RiskLevel.LOW;
      }
   }
   /**
   response body:
    {
    "safe": {
        "profile": "SAFE",
        "first_shot": {
            "club": "Lob Wedge",
            "aim_lonlat": {
                "lon": 17.62941909699988,
                "lat": 59.49379904713375
            },
            "distance_m": 15.8
        },
        "plan": [
            {
                "club": "Lob Wedge",
                "aim_lonlat": {
                    "lon": 17.62941909699988,
                    "lat": 59.49379904713375
                },
                "distance_m": 15.8,
                "edge_cost": 9.953
            },
            {
                "club": "Lob Wedge",
                "aim_lonlat": {
                    "lon": 17.629277536112774,
                    "lat": 59.49358345245175
                },
                "distance_m": 25.3,
                "edge_cost": 6.27
            },
            {
                "club": "3 Iron",
                "aim_lonlat": {
                    "lon": 17.62941909699988,
                    "lat": 59.49185869499577
                },
                "distance_m": 192.2,
                "edge_cost": -1.737
            }
        ],
        "total_cost": 14.486,
        "reachable": true
    },
    "aggressive": {
        "profile": "AGGRESSIVE",
        "first_shot": {
            "club": "Driver",
            "aim_lonlat": {
                "lon": 17.62941909699988,
                "lat": 59.49236174925376
            },
            "distance_m": 175.6
        },
        "plan": [
            {
                "club": "Driver",
                "aim_lonlat": {
                    "lon": 17.62941909699988,
                    "lat": 59.49236174925376
                },
                "distance_m": 175.6,
                "edge_cost": 9.795
            },
            {
                "club": "Sand Wedge",
                "aim_lonlat": {
                    "lon": 17.62941909699988,
                    "lat": 59.49185869499577
                },
                "distance_m": 56,
                "edge_cost": 1.605
            }
        ],
        "total_cost": 11.4,
        "reachable": true
    }
}
   */

   async suggestShots(request: unknown) {
      // calling the prediction engine
      const response = await fetch(`${this.fastApiAddress}/api/v1/golf-caddie/suggest-shots`, {
         method: "POST",
         headers: {
            "Content-Type": "application/json",
         },
         body: JSON.stringify(request),
      });

      if (!response.ok) {
         const errorText = await response.text();
         console.error(`Prediction engine error: ${response.status} - ${errorText}`);
         throw new Error(`Prediction engine returned ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      // const voiceToneInstructions = getVoiceToneInstructions();
      const voiceToneInstructions = getVoiceToneInstructions();

      // Log response for debugging
      console.log(
         `Prediction engine response: safe.reachable=${data.safe?.reachable}, aggressive.reachable=${data.aggressive?.reachable}`,
      );
      if (!data.safe?.reachable || !data.aggressive?.reachable) {
         console.warn(
            `Unreachable paths detected: safe=${data.safe?.reachable}, aggressive=${data.aggressive?.reachable}`,
         );
      }

      // const safeShotClub = data.safe.first_shot?.club || null;
      // const aggressiveShotClub = data.aggressive.first_shot?.club || null;

      // if (safeShotClub && aggressiveShotClub) {
      //   const safeShotTextResponse = await this.openai.chat.completions.create({
      //     model: "gpt-4o-mini",
      //     messages: [{ role: "user", content: `${voiceToneInstructions}\n\n Golf rules assistant. Suggest the safe shot using ${safeShotClub} club and tell the user to follow the white line. Write only one short sentence. Do not add any extra information.` }],
      //   });
      //   const aggressiveShotTextResponse = await this.openai.chat.completions.create({
      //     model: "gpt-4o-mini",
      //     messages: [{ role: "user", content: `${voiceToneInstructions}\n\n Golf rules assistant. Suggest the aggressive shot using ${aggressiveShotClub} club and tell the user to follow the white line. Write only one short sentence. Do not add any extra information.` }],
      //   });
      //   const safeShotText = safeShotTextResponse.choices[0]?.message?.content || "";
      //   const aggressiveShotText = aggressiveShotTextResponse.choices[0]?.message?.content || "";

      //   data.safe_shot_text = safeShotText;
      //   data.aggressive_shot_text = aggressiveShotText;
      // } else {
      //   data.safe_shot_text = null;
      //   data.aggressive_shot_text = null;
      // }

      const safeShotClub = data.safe.first_shot?.club || null;
      const aggressiveShotClub = data.aggressive.first_shot?.club || null;

      if (safeShotClub && aggressiveShotClub) {
         const safeShotTextResponse = await this.openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
               {
                  role: "user",
                  content: `${voiceToneInstructions}\n\n Golf rules assistant. Suggest the safe shot using ${safeShotClub} club and tell the user to follow the white line. Write only one short sentence. Do not add any extra information.`,
               },
            ],
         });
         const aggressiveShotTextResponse = await this.openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
               {
                  role: "user",
                  content: `${voiceToneInstructions}\n\n Golf rules assistant. Suggest the aggressive shot using ${aggressiveShotClub} club and tell the user to follow the white line. Write only one short sentence. Do not add any extra information.`,
               },
            ],
         });
         const safeShotText = safeShotTextResponse.choices[0]?.message?.content || "";
         const aggressiveShotText = aggressiveShotTextResponse.choices[0]?.message?.content || "";

         data.safe_shot_text = safeShotText;
         data.aggressive_shot_text = aggressiveShotText;
      } else {
         data.safe_shot_text = null;
         data.aggressive_shot_text = null;
      }
      return data;
   }
}
