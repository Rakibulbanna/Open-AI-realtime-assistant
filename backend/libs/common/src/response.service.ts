import { Response } from "express";

export interface IResponse {
   statusCode: number;
   message: string;
   data?: any;
}

export const sendData = async (statusCode: number, message: string, data?: any): Promise<IResponse> => {
   return {
      statusCode,
      message,
      data,
   };
};

export const sendResponse = (res: Response, data: IResponse) => {
   res.status(data.statusCode).json({
      statusCode: data.statusCode,
      message: data.message,
      results: data.data || null,
      timestamp: new Date().toISOString(),
   });
};
