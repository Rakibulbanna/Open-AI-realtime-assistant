import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import * as crypto from "crypto";


@Injectable()
export class CommonService {
   constructor(private readonly jwtService: JwtService) { }
   public randomNumber(range: number) {
      return Math.floor(1000 + Math.random() * range).toString();
   }
   public unique_string_generator(str = "") {
      return str + Date.now().toString() + crypto.randomBytes(5).toString("hex");
   }
   /**
    * Hashes a string using bcrypt with a specified cost factor.
    * @param str - The string to be hashed.
    * @returns A Promise that resolves to the hashed representation of the input string.
    * @throws ErrorException - Throws an error exception if the hashing process encounters an error.
    */
   async hashPassword(password: string) {
      try {
         const saltRounds = 10;
         const passwordString = String(password);
         return await bcrypt.hash(passwordString, saltRounds);
      } catch (error) {
         throw new Error("Error hashing password!");
      }
   }
   /**
    * Compares a token with a hashed value to check for a match.
    * @param hash - The hashed value against which the token will be compared.
    * @param str - The str to compare with the hashed value.
    * @returns A Promise that resolves to a boolean indicating whether the token matches the hash.
    * @throws ErrorException - Throws an error exception if the comparison process encounters an error.
    */
   public async compare(hash: string, str: string): Promise<boolean> {
      try {
         if (typeof hash !== "string" || typeof str !== "string") {
            throw new Error("Inputs must be strings");
         }
         const result = await bcrypt.compare(str, hash);
         return result;
      } catch (error) {
         throw new Error("Comparison error!");
      }
   }
   /**
    * @param {Object} param
    * @param {number} param.skip
    * @param {number} param.limit
    * @param {string} param.sortBy
    * @param {string} param.order
    * @param {string} param.getType
    * @returns {Object}
    */

   public getPagination({
      skip,
      limit,
      sortBy,
      order = "desc",
      getType,
   }: {
      skip?: number;
      limit?: number;
      sortBy?: string;
      order?: string;
      getType?: string;
   }) {
      const pagination: any = {};

      if (sortBy) {
         pagination["orderBy"] = { [sortBy]: order };
      }
      if (getType !== "all") {
         if (skip) {
            pagination["skip"] = Number(skip);
         }
         if (limit) {
            pagination["take"] = Number(limit);
         }
      }
      return pagination;
   }

   /**
    * Generates a JSON Web Token (JWT) using provided payload, secret, and expiration options.
    * @param options - An object containing payload, secret, and expiration configuration for the token.
    * @param options.payload - The payload to be encoded within the token.
    * @param options.secret - The secret used to sign the token.
    * @param options.expiresIn - Expiration time for the token in seconds.
    * @returns A Promise that resolves to a string representing the generated JWT.
    * @throws ErrorException - Throws an error exception if token generation encounters an error.
    */
   public async generateToken({
      payload,
      secret,
      expiresIn,
   }: {
      payload: object;
      secret: string;
      expiresIn: number;
   }): Promise<string> {
      try {
         return this.jwtService.signAsync(
            { ...payload },
            {
               secret,
               expiresIn,
            },
         );
      } catch (error) {
         throw new Error("Token generation encountered an error!");
      }
   }

   /**
    * Decodes a JSON Web Token (JWT) using the provided token and secret key.
    * @param token - The JWT token to be decoded.
    * @param secret_key - The secret key used to verify and decode the JWT.
    * @returns A Promise that resolves to the decoded content of the token.
    * @throws UnauthorizedException - Throws an unauthorized exception if the token is invalid.
    */
   public async decodeToken(token: string, secret_key: string) {
      return await this.jwtService.verifyAsync(token, { secret: secret_key }) as any;
   }

   // public async sendSMS(
   //   mobile_number: string,
   //   message: string,
   // ): Promise<boolean> {
   //   try {
   //     const twilioClient = new Twilio(
   //       process.env.TWILIO_ACCOUNT_SID,
   //       process.env.TWILIO_AUTH_TOKEN,
   //     );
   //     await twilioClient.messages.create({
   //       body: message,
   //       from: process.env.TWILIO_PHONE_NUMBER,
   //       to: mobile_number,
   //     });
   //     return true;
   //   } catch (error) {
   //     return false;
   //   }
   // }
}
