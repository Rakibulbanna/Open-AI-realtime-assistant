import { Request } from "express";

export interface IRequest extends Request {
   user_id: string;
   role: string;
   company_id: string;
   role_id: string;
   can_read_all_data?: boolean;
   project_id?: string;
   module_id?: string;
   search?: string;
   project_task_status_id?: string;
}
