import { Controller, Post, Body, HttpCode, HttpStatus, UseInterceptors, UploadedFile, Res } from "@nestjs/common";
import { Response } from "express";
import { GolfCaddieService } from "./golf-caddie.service";
import {
   ShotRecommendationRequestDto,
   ShotRecommendationResponseDto,
   ShotRecommendationRequestSchema,
   VoiceToTextResponseDto,
   SuggestShotsResponseDto,
   SuggestShotsRequestDto,
   SuggestShotsRequestSchema,
   SuggestShotsRequestSimpleSchema,
} from "./dto/shot-recommendation.dto";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiConsumes } from "@nestjs/swagger";
import { AssistantChatRequestDto, AssistantChatRequestSchema, AssistantChatResponseDto } from "./dto/assistant.dto";
import { AssistantService } from "./services/assistant.service";
import { CourseDataService } from "./services/course-data.service";
import { FunctionHandlerService } from "./services/function-handler.service";

@ApiTags("Golf Caddie")
@Controller("golf-caddie")
export class GolfCaddieController {
   constructor(
      private readonly golfCaddieService: GolfCaddieService,
      private readonly assistantService: AssistantService,
      private readonly courseDataService: CourseDataService,
      private readonly functionHandlerService: FunctionHandlerService,
   ) {}

   @Post("recommend")
   @HttpCode(HttpStatus.OK)
   @ApiOperation({
      summary: "Get shot recommendation",
      description:
         "Get AI-powered club recommendations based on player position, hole position, wind conditions, player profile, and course obstacles. Returns both safe and aggressive club options with success probabilities.",
   })
   @ApiBody({ type: ShotRecommendationRequestDto })
   @ApiResponse({
      status: 200,
      description: "Shot recommendation generated successfully",
      type: ShotRecommendationResponseDto,
   })
   @ApiResponse({
      status: 400,
      description: "Invalid request body - validation failed",
   })
   async recommendShot(@Body() body: unknown): Promise<ShotRecommendationResponseDto> {
      const request = ShotRecommendationRequestSchema.parse(body) as ShotRecommendationRequestDto;
      return this.golfCaddieService.recommendClubs(request);
   }

   /**
    * Chat with the AI golf caddie assistant
    * Supports function calling for GPS, club recommendations, rules queries, etc.
    *
    * Example request:
    * {
    *   "messages": [
    *     { "role": "user", "content": "I'm at the tee on hole 1" }
    *   ],
    *   "courseId": "course-123",
    *   "holeNumber": 1,
    *   "playerProfile": { ... },
    *   "currentPosition": { "lat": 59.3293, "lng": 18.0686 },
    *   "holePosition": { "lat": 59.3300, "lng": 18.0690 },
    *   "currentLie": "tee",
    *   "wind": { "speed_mps": 5, "direction_deg": 180 }
    * }
    */
   @Post("assistant/chat")
   @HttpCode(HttpStatus.OK)
   async chat(@Body() body: unknown): Promise<AssistantChatResponseDto> {
      const request = AssistantChatRequestSchema.parse(body) as AssistantChatRequestDto;
      return this.assistantService.chat(request);
   }

   @Post("voice-to-text")
   @UseInterceptors(FileInterceptor("audio"))
   @HttpCode(HttpStatus.OK)
   @ApiOperation({
      summary: "Convert voice to text",
      description:
         "Upload an audio file to convert speech to text. Supports common audio formats like MP3, MP4, WAV, WebM, M4A, OGG, etc.",
   })
   @ApiConsumes("multipart/form-data")
   @ApiBody({
      description: "Audio file for speech-to-text conversion",
      schema: {
         type: "object",
         properties: {
            audio: {
               type: "string",
               format: "binary",
               description: "Audio file (MP3, MP4, WAV, WebM, M4A, OGG, etc.)",
            },
         },
         required: ["audio"],
      },
   })
   @ApiResponse({
      status: 200,
      description: "Audio successfully transcribed to text",
      type: VoiceToTextResponseDto,
   })
   @ApiResponse({
      status: 400,
      description: "No audio file provided or invalid format",
   })
   async voiceToText(@UploadedFile() audio: Express.Multer.File): Promise<VoiceToTextResponseDto> {
      if (!audio) {
         throw new Error("No audio file provided");
      }
      console.log("111111111111111111111mimetype___", audio.mimetype);
      console.log("22222222222222222audio___", audio);

      const text = await this.golfCaddieService.convertSpeechToText(audio.buffer, audio.mimetype);
      return { text };
   }

   @Post("text-to-voice")
   @HttpCode(HttpStatus.OK)
   @ApiOperation({
      summary: "Convert text to voice",
      description:
         "Convert text to voice and return MP3 audio file. Optionally accepts a 'personality' field (e.g. 'Gordon Ramsay', 'Anika Svensson') which is mapped to different underlying TTS voices. The response will be an audio/mpeg file stream.",
   })
   @ApiBody({
      schema: {
         type: "object",
         properties: {
            text: { type: "string" },
            personality: {
               type: "string",
               description: "Optional personality label, e.g. 'Gordon Ramsay' or 'Anika Svensson'",
            },
            is_system_prompt_applied: {
               type: "boolean",
               description: "Optional flag to apply system prompt to the text",
            },
         },
         required: ["text"],
      },
   })
   @ApiResponse({
      status: 200,
      description: "Text successfully converted to voice - returns MP3 audio file",
      content: {
         "audio/mpeg": {
            schema: {
               type: "string",
               format: "binary",
            },
         },
      },
   })
   @ApiResponse({
      status: 400,
      description: "Invalid request body - validation failed",
   })
   async textToVoice(
      @Body() body: { text: string; personality?: string; is_system_prompt_applied?: boolean },
      @Res() res: Response,
   ): Promise<void> {
      const { text, personality, is_system_prompt_applied } = body;
      const audioBuffer = await this.golfCaddieService.convertTextToSpeech(text, personality, is_system_prompt_applied);
      // res.json({
      //   audioBuffer: audioBuffer,
      //   text: text,
      // });
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Content-Disposition", 'attachment; filename="voice.mp3"');
      res.setHeader("Content-Length", audioBuffer.length);
      res.send(audioBuffer);
   }

   /*
    // request body:
{
    "hole": {
      "perimeter": [
        [18.033658005043, 59.569053312508],
        [18.032402731224, 59.567810227754],
        [18.032343722625, 59.567573832639],
        [18.033371008678, 59.567186629826],
        [18.034293688743, 59.568864475408],
        [18.033658005043, 59.569053312508]
      ],
      "green": [
        [18.03311351694, 59.567620024753],
        [18.032762147559, 59.567562963692],
        [18.032890893592, 59.567469220312],
        [18.033156432284, 59.567533074527],
        [18.03311351694, 59.567620024753]
      ],
      "bunkers": [],
      "water": [],
      "trees": [],
      "no_fly_always": [],
      "no_fly_safe": [],
      "no_fly_aggressive": [],
      "tee_boxes": [],
      "tee_center": [18.033507982803, 59.568520901064],
      "green_center": [18.032985186508, 59.567527606357]
    },
    "start_lon": 18.033507982803,
    "start_lat": 59.568520901064
  }
    response body:
    {
    "safe": {
        "profile": "SAFE",
        "first_shot": {
            "club": "4 Iron",
            "aim_lonlat": {
                "lon": 18.032985186508,
                "lat": 59.567527606357
            },
            "distance_m": 114.4
        },
        "plan": [
            {
                "club": "4 Iron",
                "aim_lonlat": {
                    "lon": 18.032985186508,
                    "lat": 59.567527606357
                },
                "distance_m": 114.4,
                "edge_cost": 1.114
            }
        ],
        "total_cost": 1.114
    },
    "aggressive": {
        "profile": "AGGRESSIVE",
        "first_shot": {
            "club": "4 Iron",
            "aim_lonlat": {
                "lon": 18.032985186508,
                "lat": 59.567527606357
            },
            "distance_m": 114.4
        },
        "plan": [
            {
                "club": "4 Iron",
                "aim_lonlat": {
                    "lon": 18.032985186508,
                    "lat": 59.567527606357
                },
                "distance_m": 114.4,
                "edge_cost": 0.485
            }
        ],
        "total_cost": 0.485
    }
}
  */
   @Post("suggest-shots")
   @HttpCode(HttpStatus.OK)
   @ApiOperation({
      summary: "Get shot suggestions",
      description:
         "Get AI-powered shot suggestions based on player position, hole geometry, and course obstacles. Returns both safe and aggressive shot suggestions with success probabilities. Accepts either full hole data or courseId + HoleNumber.",
   })
   @ApiBody({ type: SuggestShotsRequestDto })
   @ApiResponse({
      status: 200,
      description: "Shot suggestions generated successfully",
      type: SuggestShotsResponseDto,
   })
   @ApiResponse({
      status: 400,
      description: "Invalid request body - validation failed",
   })
   async suggestShots(@Body() body: unknown) {
      const simpleRequest = SuggestShotsRequestSimpleSchema.safeParse(body);

      if (simpleRequest.success) {
         console.log("hitted__");
         // Load hole data from cache/DB and transform
         const transformedData = await this.courseDataService.getHoleDataForPrediction(
            simpleRequest.data.id_course,
            simpleRequest.data.HoleNumber,
            simpleRequest.data.start_lon,
            simpleRequest.data.start_lat,
         );
         const data = await this.golfCaddieService.suggestShots(transformedData);
         return data;
      }

      const request = SuggestShotsRequestSchema.parse(body);
      return this.golfCaddieService.suggestShots(request);
   }

   @Post("load-course-from-json")
   @HttpCode(HttpStatus.OK)
   @ApiOperation({
      summary: "Load golf course data from JSON file",
      description:
         "Load golf course data from JSON files. The file should contain vectorGPSObject with Holes, Water, Clubhouse, Background, Creek, and Tree data.",
   })
   @ApiBody({
      schema: {
         type: "object",
         properties: {
            filePath: {
               type: "string",
               description: "Path to the JSON file relative to the backend directory",
               example: "sample_data/igolf_data/Stadium_Bro_Hof_Slott_Golf_Club.json",
            },
            courseId: {
               type: "string",
               description: "Unique course identifier",
               example: "CmYDhdNfkEug",
            },
            courseName: {
               type: "string",
               description: "Optional course name",
               example: "Stadium - Bro Hof Slott Golf Club",
            },
         },
         required: ["filePath", "courseId"],
      },
   })
   @ApiResponse({
      status: 200,
      description: "Course data loaded successfully",
      schema: {
         type: "object",
         properties: {
            message: {
               type: "string",
               example: "Loaded course CmYDhdNfkEug with 18 holes",
            },
            count: {
               type: "number",
               example: 18,
            },
         },
      },
   })
   @ApiResponse({
      status: 400,
      description: "Invalid request body or file not found",
   })
   async loadCourseFromJson(
      @Body() body: { filePath: string; courseId: string; courseName?: string },
   ): Promise<{ message: string; count: number }> {
      const result = await this.courseDataService.loadCourseFromJson(body.filePath, body.courseId, body.courseName);
      return {
         message: `Loaded course ${body.courseId} with ${result.count} holes`,
         count: result.count,
      };
   }

   @Post("create-session")
   @HttpCode(HttpStatus.OK)
   @ApiOperation({
      summary: "Create a session for the golf caddie",
      description: "Create a session for the golf caddie",
   })
   async createSession(): Promise<{ client_secret: string }> {
      return this.assistantService.createSession();
   }

   @Post("prompt-func-call")
   @HttpCode(HttpStatus.OK)
   @ApiOperation({
      summary: "Prompt function call",
      description: "Prompt function call",
   })
   async promptFunctionCall(@Body() body: any) {
      return this.functionHandlerService.handlePromptFunctionCall(body);
   }
}
