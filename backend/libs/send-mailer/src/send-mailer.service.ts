import { Injectable } from "@nestjs/common";
import * as nodemailer from "nodemailer";

// import {EmailOptionTypes} from "../types";
export interface EmailOptionTypes {
   to: string;
   subject: string;
   template: string;
   context: Record<string, any>;
}

/**
 *
 * @SendMailerService Require to install ejs & Nodemailer
 * @packageRef : https://www.npmjs.com/package/ejs  & https://www.npmjs.com/package/nodemailer
 *
 */

@Injectable()
export class SendMailerService {
   private transporter: nodemailer.Transporter;

   constructor() {
      this.transporter = nodemailer.createTransport({
         host: process.env.MAIL_HOST,
         port: process.env.MAIL_PORT ? Number(process.env.MAIL_PORT) : 465,
         secure: true,
         auth: {
            user: process.env.MAIL_USER,
            pass: process.env.MAIL_PASS,
         },
      });
   }

   /**
    *
    * @sendMail  Received as a parameter @EmailOptionTypes which that will be
    * @param {EmailOptionTypes}: email subject, template, data{[key:string]: any}
    * @returns : Promise<void>
    */

   async sendEmail(emails: string[] = [], subject: string, message: string, customCSS: string = "") {
      try {
         const html = `
                   <html>
                       <head>
                           <style>
                              ${customCSS}
                           </style>
                       </head>
                       <body>
                           ${message}
                       </body>
                   </html>
                   `;

         // Convert the array of emails to a comma-separated string
         const recipients = Array.isArray(emails) ? emails.join(",") : emails;

         const checkerEmail = await this.transporter.sendMail({
            from: process.env.MAIL_USER,
            to: recipients,
            subject: subject,
            html: html,
         });

         if (checkerEmail) return true;
         else return false;
      } catch (error) {
         console.log("NODEMAILER ERROR", error);
         return false;
      }
   }
}
