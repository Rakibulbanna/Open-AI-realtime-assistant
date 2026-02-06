import { Injectable, Logger } from "@nestjs/common";
import { AssistantFunctionNames } from "../enums/assistant-functions.enum";
import { GolfCaddieService } from "../golf-caddie.service";
import { RagService } from "../../rag/services/rag.service";
import {
  LieType,
  PositionDto,
  ShotRecommendationRequestDto,
} from "../dto/shot-recommendation.dto";
import { QueryContextDto } from "../../rag/dto/rule-query.dto";
import { AssistantChatRequestDto } from "../dto/assistant.dto";
import { getVoiceForPersonality } from "../utils/assistant-utils";
import { CourseDataService } from "./course-data.service";
// import { ToolHandlerService } from "../../rag/gateways/tool-handler.service";

@Injectable()
export class FunctionHandlerService {
  private readonly logger = new Logger(FunctionHandlerService.name);

  constructor(
    private readonly golfCaddieService: GolfCaddieService,
    private readonly ragService: RagService,
    private readonly courseDataService: CourseDataService,
    // private readonly toolHandler: ToolHandlerService
  ) { }

  /**
   * Handle function calls from the assistant
   */
  async handleFunctionCall(
    functionName: string,
    args: any,
    context?: AssistantChatRequestDto
  ): Promise<any> {
    try {
      this.logger.debug(`Handling function call: ${functionName}`, { args });

      switch (functionName) {
        case AssistantFunctionNames.SET_PERSONALITY:
          return this.handleSetPersonality(args);

        case AssistantFunctionNames.GET_GPS_LOCATION:
          return this.handleGetGpsLocation(context);

        case AssistantFunctionNames.GET_PREDICTABILITY_SUGGESTION:
          return this.handleGetPredictabilitySuggestion(args, context);

        case AssistantFunctionNames.SET_USED_CLUB:
          return this.handleSetUsedClub(args);

        case AssistantFunctionNames.SET_AT_GREEN:
          return this.handleSetAtGreen(args);

        case AssistantFunctionNames.SET_ALL_STROKES_DATABASE:
          return this.handleSetAllStrokesDatabase(args);

        case AssistantFunctionNames.CALL_RULEBOOK:
          return this.handleCallRulebook(args);

        case AssistantFunctionNames.SET_WIND_CONDITION:
          return this.handleSetWindCondition(args);

        default:
          throw new Error(`Unknown function: ${functionName}`);
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.logger.error(
        `Error handling function ${functionName}: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined
      );
      throw error;
    }
  }

  /**
   * Set personality mode
   */
  private async handleSetPersonality(args: {
    persona_name: string;
  }): Promise<{ success: boolean; persona: string }> {
    // Store personality preference (could be stored in session/database)
    const personality = getVoiceForPersonality(args.persona_name);
    return {
      success: true,
      persona: personality,
    };
  }

  /**
   * Get current GPS location
   */
  private async handleGetGpsLocation(
    context?: AssistantChatRequestDto
  ): Promise<PositionDto> {
    if (!context?.currentPosition) {
      throw new Error(
        "GPS location not available. Please provide current position in the request."
      );
    }
    return context?.currentPosition;
  }

  /**
   * Get predictability suggestion (club recommendations)
   */
  private async handleGetPredictabilitySuggestion(
    args: any,
    context?: AssistantChatRequestDto
  ): Promise<any> {
    // Extract hole data and GPS coordinates from args
    // Args should contain: { hole: {...}, start_lon: number, start_lat: number }
    const { id_course, hole_number, start_lon, start_lat } = args;

    // Validate required fields
    if (
      !id_course ||
      !hole_number ||
      start_lon === undefined ||
      start_lat === undefined
    ) {
      throw new Error(
        "Missing required parameters: id_course, hole_number, start_lon, and start_lat are required for get_predictability_suggestion"
      );
    }
    const transformedData =
      await this.courseDataService.getHoleDataForPrediction(id_course, hole_number, start_lon, start_lat);

    const response = await this.golfCaddieService.suggestShots(transformedData);
    return response;
  }

  /**
   * Set used club
   */
  private async handleSetUsedClub(args: {
    hole_number: number;
    shot_number: number;
    club_name: string;
    lie_type: string;
    gps_position: PositionDto;
  }): Promise<{ success: boolean; message: string }> {
    // Log club usage (could be stored in database)
    this.logger.log(
      `Club logged: Hole ${args.hole_number}, Shot ${args.shot_number}, Club: ${args.club_name}, Lie: ${args.lie_type}`
    );
    return {
      success: true,
      message: `Club ${args.club_name} logged for hole ${args.hole_number}, shot ${args.shot_number}`,
    };
  }

  /**
   * Set at green
   */
  private async handleSetAtGreen(args: {
    hole_number: number;
    gps_position: PositionDto;
  }): Promise<{
    success: boolean;
    message: string;
  }> {
    // Mark that player reached green (could be stored in database)
    this.logger.log(
      `Player reached green on hole ${args.hole_number} at position: ${JSON.stringify(args.gps_position)}`
    );
    return {
      success: true,
      message: `Marked as on green for hole ${args.hole_number}`,
    };
  }

  /**
   * Set all strokes database
   */
  private async handleSetAllStrokesDatabase(args: {
    hole_number: number;
    total_strokes_for_hole: number;
    putts_for_hole: number;
  }): Promise<{ success: boolean; message: string }> {
    // Store stroke data (could be stored in database)
    this.logger.log(
      `Strokes logged: Hole ${args.hole_number}, Total: ${args.total_strokes_for_hole}, Putts: ${args.putts_for_hole}`
    );
    return {
      success: true,
      message: `Strokes logged for hole ${args.hole_number}: ${args.total_strokes_for_hole} total, ${args.putts_for_hole} putts`,
    };
  }

  /**
   * Call rulebook (RAG query)
   */
  public async handleCallRulebook(args: {
    question: string;
    context?: { lie?: string; situation?: string };
  }): Promise<any> {

    if (!args?.question?.trim()) {
      throw new Error("Question is required and cannot be empty");
    }

    const queryContext: QueryContextDto = {};

    if (args.context?.lie) {
      const lieTypeMap: Record<string, LieType> = {
        tee: LieType.TEE,
        fairway: LieType.FAIRWAY,
        rough: LieType.ROUGH,
        bunker: LieType.BUNKER,
        green: LieType.GREEN,
      };
      queryContext.lie = lieTypeMap[args.context.lie.toLowerCase()];
    }

    if (args.context?.situation) {
      queryContext.situation = args.context.situation;
    }

    const response = await this.ragService.queryRules({
      query: args.question,
      context: Object.keys(queryContext).length > 0 ? queryContext : undefined,
      maxResults: 3,
      isWebRTCQuery: true,
    });

    return {
      answer: response.answer,
      // rules: response.retrievedRules,
      // confidence: response.confidence,
      // disclaimer: response.disclaimer,
    };
  }

  /**
   * Set wind condition
   */
  private async handleSetWindCondition(args: {
    wind_speed: number;
    wind_direction: number;
  }): Promise<{
    success: boolean;
    wind: { speed_mps: number; direction_deg: number };
  }> {
    // Store wind condition (could be stored in session/database)
    return {
      success: true,
      wind: {
        speed_mps: args.wind_speed,
        direction_deg: args.wind_direction,
      },
    };
  }

  async handlePromptFunctionCall(payload: any): Promise<any> {
    console.log("payload____", JSON.stringify(payload, null, 2));
    try {

      // const { sessionId, call_id, name, arguments: rawArgs } = args;
      const args = typeof payload.arguments === "string" ? JSON.parse(payload.arguments) : payload.arguments ?? {};
      const output = await this.handleFunctionCall(payload.name, args, payload.sessionId);
      return output;
    } catch (error) {
      this.logger.error(`Error handling prompt function call: ${error}`);
      return { error: "Internal server error" };
    }
  }
}
