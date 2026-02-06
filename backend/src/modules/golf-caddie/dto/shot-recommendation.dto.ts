import { z } from "zod";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export enum LieType {
  TEE = "tee",
  FAIRWAY = "fairway",
  ROUGH = "rough",
  BUNKER = "bunker",
  GREEN = "green",
}

export enum FairwayWidth {
  WIDE = "wide",
  MEDIUM = "medium",
  NARROW = "narrow",
}

export enum WindImpact {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
}

export enum RiskLevel {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
}

// Zod Schemas
export const PositionSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const WindSchema = z.object({
  speed_mps: z.number().min(0),
  direction_deg: z.number().min(0).max(360),
});

export const ClubDistancesSchema = z.object({
  Driver: z.number().min(0),
  "3Wood": z.number().min(0),
  "5Iron": z.number().min(0),
  "7Iron": z.number().min(0),
  "9Iron": z.number().min(0),
  PW: z.number().min(0),
  SW: z.number().min(0),
});

export const PlayerProfileSchema = z.object({
  handicap: z.number().min(0).max(54),
  clubDistances: ClubDistancesSchema,
});

export const ObstaclesSchema = z.object({
  bunkersInLineOfPlay: z.boolean(),
  fairwayWidth: z.nativeEnum(FairwayWidth),
});

export const ShotRecommendationRequestSchema = z.object({
  courseId: z.string(),
  holeNumber: z.number().int().min(1).max(18),
  playerPosition: PositionSchema,
  holePosition: PositionSchema,
  lie: z.nativeEnum(LieType),
  wind: WindSchema,
  playerProfile: PlayerProfileSchema,
  obstacles: ObstaclesSchema,
});

export const RecommendedClubSchema = z.object({
  type: z.enum(["SAFE", "AGGRESSIVE"]),
  club: z.string(),
  expectedDistance_m: z.number(),
  successProbability_pct: z.number().min(0).max(100),
  reason: z.string(),
});

export const ContextSummarySchema = z.object({
  distanceToHole_m: z.number(),
  lie: z.string(),
  windImpact: z.nativeEnum(WindImpact),
  riskLevel: z.nativeEnum(RiskLevel),
});

export const ShotRecommendationResponseSchema = z.object({
  recommendedClubs: z.array(RecommendedClubSchema),
  contextSummary: ContextSummarySchema,
});

export const HoleSchema = z.object({
  perimeter: z.array(z.any()),
  green: z.array(z.any()),
  fairway: z.array(z.any()).optional().nullable(),
  bunkers: z.array(z.any()).optional().nullable(),
  water: z.array(z.any()).optional().nullable(),
  trees: z.array(z.any()).optional().nullable(),
  tree_points: z.array(z.any()).optional().nullable(),
  no_fly_always: z.array(z.any()).optional().nullable(),
  no_fly_safe: z.array(z.any()).optional().nullable(),
  no_fly_aggressive: z.array(z.any()).optional().nullable(),
  tee_boxes: z.array(z.any()).optional().nullable(),
  tee_center: z.array(z.any()).optional().nullable(),
  green_center: z.array(z.any()),
});

export const SuggestShotsRequestSchema = z.object({
  hole: HoleSchema,
  start_lon: z.number(),
  start_lat: z.number(),
});
export type SuggestShotsRequestType = z.infer<typeof SuggestShotsRequestSchema>;

// New schema for the simplified request format
export const SuggestShotsRequestSimpleSchema = z.object({
  id_course: z.string(),
  HoleNumber: z.number().int().min(1).max(18),
  start_lon: z.number(),
  start_lat: z.number(),
});
export type SuggestShotsRequestSimpleType = z.infer<
  typeof SuggestShotsRequestSimpleSchema
>;

export class HoleDto {
  @ApiProperty({
    description: "Hole perimeter coordinates",
    type: "array",
    items: { type: "array", items: { type: "number" } },
    example: [
      [18.033658005043, 59.569053312508],
      [18.032402731224, 59.567810227754],
    ],
  })
  perimeter: number[][];

  @ApiProperty({
    description: "Green coordinates",
    type: "array",
    items: { type: "array", items: { type: "number" } },
    example: [
      [18.03311351694, 59.567620024753],
      [18.032762147559, 59.567562963692],
    ],
  })
  green: number[][];

  @ApiProperty({
    description: "Bunker coordinates - array of polygons (each bunker is a polygon) - nullable",
    type: "array",
    items: {
      type: "array",
      items: { type: "array", items: { type: "number" } },
    },
    required: false,
    nullable: true,
    example: [
      [
        [17.63024624161153, 59.4960997543501],
        [17.630222101730396, 59.496110646198645],
      ],
    ],
  })
  bunkers?: number[][][] | null;

  @ApiProperty({
    description: "Water hazard coordinates - array of polygons (each water hazard is a polygon) - nullable",
    type: "array",
    items: {
      type: "array",
      items: { type: "array", items: { type: "number" } },
    },
    required: false,
    nullable: true,
    example: [
      [
        [17.63447395057828, 59.50264065348447],
        [17.63442495850552, 59.502674393048274],
      ],
    ],
  })
  water?: number[][][] | null;

  @ApiProperty({
    description: "Tree coordinates - nullable",
    type: "array",
    items: { type: "array", items: { type: "number" } },
    required: false,
    nullable: true,
    example: [],
  })
  trees?: number[][] | null;

  @ApiProperty({
    description: "No-fly zones (always) - nullable",
    type: "array",
    items: { type: "array", items: { type: "number" } },
    required: false,
    nullable: true,
    example: [],
  })
  no_fly_always?: number[][] | null;

  @ApiProperty({
    description: "No-fly zones (safe profile) - nullable",
    type: "array",
    items: { type: "array", items: { type: "number" } },
    required: false,
    nullable: true,
    example: [],
  })
  no_fly_safe?: number[][] | null;

  @ApiProperty({
    description: "No-fly zones (aggressive profile) - nullable",
    type: "array",
    items: { type: "array", items: { type: "number" } },
    required: false,
    nullable: true,
    example: [],
  })
  no_fly_aggressive?: number[][] | null;

  @ApiProperty({
    description: "Tee box coordinates - array of polygons (each tee box is a polygon) - nullable",
    type: "array",
    items: {
      type: "array",
      items: { type: "array", items: { type: "number" } },
    },
    required: false,
    nullable: true,
    example: [
      [
        [17.632416579893864, 59.49822254758181],
        [17.632303927115238, 59.49816945310902],
      ],
    ],
  })
  tee_boxes?: number[][][] | null;

  @ApiProperty({
    description: "Tee center coordinates [lon, lat] - nullable",
    type: "array",
    items: { type: "number" },
    required: false,
    nullable: true,
    example: [18.033507982803, 59.568520901064],
  })
  tee_center?: number[] | null;

  @ApiProperty({
    description: "Green center coordinates [lon, lat]",
    type: "array",
    items: { type: "number" },
    example: [18.032985186508, 59.567527606357],
  })
  green_center: number[];
}

export class SuggestShotsRequestDto {
  @ApiProperty({
    description: "Hole geometry and obstacles",
    type: HoleDto,
    required: false,
  })
  hole?: HoleDto;

  @ApiProperty({
    description: "Starting longitude",
    example: 18.033507982803,
  })
  start_lon: number;

  @ApiProperty({
    description: "Starting latitude",
    example: 59.568520901064,
  })
  start_lat: number;

  @ApiProperty({
    description: "Course ID (required if hole is not provided)",
    example: "CmYDhdNfkEug",
    required: false,
  })
  id_course?: string;

  @ApiProperty({
    description: "Hole number (required if hole is not provided)",
    example: 9,
    required: false,
  })
  HoleNumber?: number;
}

// Swagger DTO Classes
export class PositionDto {
  @ApiProperty({
    description: "Latitude coordinate",
    minimum: -90,
    maximum: 90,
    example: 33.7501,
  })
  lat: number;

  @ApiProperty({
    description: "Longitude coordinate",
    minimum: -180,
    maximum: 180,
    example: -84.3885,
  })
  lng: number;
}

export class WindDto {
  @ApiProperty({
    description: "Wind speed in meters per second",
    minimum: 0,
    example: 5.2,
  })
  speed_mps: number;

  @ApiProperty({
    description: "Wind direction in degrees (0-360)",
    minimum: 0,
    maximum: 360,
    example: 180,
  })
  direction_deg: number;
}

export class ClubDistancesDto {
  @ApiProperty({
    description: "Driver distance in meters",
    minimum: 0,
    example: 230,
  })
  Driver: number;

  @ApiProperty({
    description: "3-Wood distance in meters",
    minimum: 0,
    example: 200,
  })
  "3Wood": number;

  @ApiProperty({
    description: "5-Iron distance in meters",
    minimum: 0,
    example: 165,
  })
  "5Iron": number;

  @ApiProperty({
    description: "7-Iron distance in meters",
    minimum: 0,
    example: 145,
  })
  "7Iron": number;

  @ApiProperty({
    description: "9-Iron distance in meters",
    minimum: 0,
    example: 125,
  })
  "9Iron": number;

  @ApiProperty({
    description: "Pitching Wedge distance in meters",
    minimum: 0,
    example: 110,
  })
  PW: number;

  @ApiProperty({
    description: "Sand Wedge distance in meters",
    minimum: 0,
    example: 90,
  })
  SW: number;
}

export class PlayerProfileDto {
  @ApiProperty({
    description: "Player handicap (0-54)",
    minimum: 0,
    maximum: 54,
    example: 15,
  })
  handicap: number;

  @ApiProperty({ description: "Player club distances", type: ClubDistancesDto })
  clubDistances: ClubDistancesDto;
}

export class ObstaclesDto {
  @ApiProperty({
    description: "Whether bunkers are in the line of play",
    example: true,
  })
  bunkersInLineOfPlay: boolean;

  @ApiProperty({
    description: "Fairway width",
    enum: FairwayWidth,
    example: FairwayWidth.MEDIUM,
  })
  fairwayWidth: FairwayWidth;
}

export class ShotRecommendationRequestDto {
  @ApiProperty({
    description: "Unique identifier for the golf course",
    example: "course-001",
  })
  courseId: string;

  @ApiProperty({
    description: "Hole number (1-18)",
    minimum: 1,
    maximum: 18,
    example: 7,
  })
  holeNumber: number;

  @ApiProperty({ description: "Current player position", type: PositionDto })
  playerPosition: PositionDto;

  @ApiProperty({ description: "Hole/pin position", type: PositionDto })
  holePosition: PositionDto;

  @ApiProperty({
    description: "Current lie type",
    enum: LieType,
    example: LieType.FAIRWAY,
  })
  lie: LieType;

  @ApiProperty({ description: "Current wind conditions", type: WindDto })
  wind: WindDto;

  @ApiProperty({
    description: "Player profile with handicap and club distances",
    type: PlayerProfileDto,
  })
  playerProfile: PlayerProfileDto;

  @ApiProperty({
    description: "Course obstacles information",
    type: ObstaclesDto,
  })
  obstacles: ObstaclesDto;
}

export class RecommendedClubDto {
  @ApiProperty({
    description: "Recommendation type",
    enum: ["SAFE", "AGGRESSIVE"],
    example: "SAFE",
  })
  type: "SAFE" | "AGGRESSIVE";

  @ApiProperty({ description: "Recommended club name", example: "7Iron" })
  club: string;

  @ApiProperty({ description: "Expected distance in meters", example: 145 })
  expectedDistance_m: number;

  @ApiProperty({
    description: "Success probability percentage (0-100)",
    minimum: 0,
    maximum: 100,
    example: 85,
  })
  successProbability_pct: number;

  @ApiProperty({
    description: "Reasoning for this recommendation",
    example: "Safe club choice given the distance and wind conditions",
  })
  reason: string;
}

export class ContextSummaryDto {
  @ApiProperty({ description: "Distance to hole in meters", example: 150 })
  distanceToHole_m: number;

  @ApiProperty({ description: "Current lie description", example: "fairway" })
  lie: string;

  @ApiProperty({
    description: "Wind impact level",
    enum: WindImpact,
    example: WindImpact.MEDIUM,
  })
  windImpact: WindImpact;

  @ApiProperty({
    description: "Overall risk level",
    enum: RiskLevel,
    example: RiskLevel.LOW,
  })
  riskLevel: RiskLevel;
}

export class ShotRecommendationResponseDto {
  @ApiProperty({
    description: "List of recommended clubs",
    type: [RecommendedClubDto],
  })
  recommendedClubs: RecommendedClubDto[];

  @ApiProperty({
    description: "Context summary for the shot",
    type: ContextSummaryDto,
  })
  contextSummary: ContextSummaryDto;
}

export class VoiceToTextResponseDto {
  @ApiProperty({
    description: "Transcribed text from the audio",
    example: "What club should I use for this shot?",
  })
  text: string;
}

export class SuggestShotsResponseDto {
  @ApiProperty({
    description: "Safe shot suggestions",
    type: ShotRecommendationResponseDto,
  })
  safe: ShotRecommendationResponseDto;

  @ApiProperty({
    description: "Aggressive shot suggestions",
    type: ShotRecommendationResponseDto,
  })
  aggressive: ShotRecommendationResponseDto;
}
