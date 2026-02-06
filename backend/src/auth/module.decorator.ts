import { PrismaService } from "@app/prisma";
import {
   SetMetadata,
   CustomDecorator,
   ExecutionContext,
   Injectable,
   CanActivate,
   ForbiddenException,
   UnauthorizedException,
   applyDecorators,
   UseGuards,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { jwt_secret, module_name } from "src/constant";

export const MODULE_KEY = "module";

// Define the interface for the Auth decorator
interface AuthConfig {
   main: module_name | module_name[];
   modules?: module_name[];
}

export function Auth(config?: AuthConfig): CustomDecorator<string> {
   return applyDecorators(SetMetadata(MODULE_KEY, config), UseGuards(ModuleGuard)) as CustomDecorator<string>;
}

@Injectable()
export class ModuleGuard implements CanActivate {
   constructor(
      private reflector: Reflector,
      private readonly jwtService: JwtService,
   ) { }

   async canActivate(context: ExecutionContext): Promise<boolean> {
      const authConfig = this.reflector.getAllAndOverride<AuthConfig | undefined>(MODULE_KEY, [
         context.getHandler(),
         context.getClass(),
      ]);

      const request = context.switchToHttp().getRequest();
      const authHeader = request.headers.authorization;
      const method = request.method;

      if (!authHeader) {
         throw new UnauthorizedException({
            status: false,
            message: "User not authorized, Authorization header is missing",
         });
      }

      const token = authHeader.split(" ")[1];
      if (!token) {
         throw new UnauthorizedException({
            status: false,
            message: "JWT token is missing",
         });
      }

      try {
         const user = this.jwtService.verify(token, { secret: jwt_secret }) as {
            role: string;
            id: string;
            company_id: string;
         };

         // const userData = await this.prisma.user.findUnique({
         //    where: { id: user.id },
         //    select: {
         //       id: true,
         //       company_id: true,
         //       Company: { select: { id: true, name: true } },
         //       role: {
         //          select: {
         //             id: true,
         //             title: true,
         //          },
         //       },
         //       UserToPermission: {
         //          where: {
         //             user_id: user.id,
         //             PermissionSelling: {
         //                company_id: user.company_id,
         //             },
         //          },
         //          select: {
         //             can_read: true,
         //             can_write: true,
         //             can_read_all_data: true,
         //             PermissionSelling: {
         //                select: {
         //                   module: {
         //                      select: {
         //                         title: true,
         //                      },
         //                   },
         //                },
         //             },
         //          },
         //       },
         //    },
         // });

         // if (!userData) {
         //    throw new ForbiddenException({
         //       status: false,
         //       message: "User not found by id",
         //    });
         // }

         // request.user_id = userData.id;
         // request.role = userData.role.title;
         // request.role_id = userData.role.id;
         // request.company_id = userData.company_id;

         // // If no auth config set → only check authentication (allow all authenticated users)
         // if (!authConfig) {
         //    return true;
         // }

         // const permissionList =
         //    userData?.UserToPermission?.map((item) => ({
         //       title: item.PermissionSelling.module.title as module_name,
         //       can_read: item.can_read,
         //       can_write: item.can_write,
         //       can_read_all_data: item.can_read_all_data,
         //    })) || [];

         return this.checkPermissions(authConfig as AuthConfig, [], method, user.role, request);
      } catch (error) {
         if (error.name === "TokenExpiredError") {
            throw new UnauthorizedException({
               status: false,
               message: "Token expired",
            });
         }
         throw error;
      }
   }

   private checkPermissions(
      authConfig: AuthConfig,
      permissionList: Array<{
         title: module_name;
         can_read: boolean;
         can_write: boolean;
         can_read_all_data: boolean;
      }>,
      method: string,
      roleTitle: string,
      request: any,
   ): boolean {
      const { main, modules } = authConfig;

      // Normalize main to array
      const mainModules = Array.isArray(main) ? main : [main];

      // Handle optional modules parameter
      const additionalModules = modules || [];

      // For GET requests: check read access for main modules OR any of the additional modules
      const mainPermissions = permissionList.filter((p) => mainModules.includes(p.title));
      const name = mainModules.map((p) => p.charAt(0).toUpperCase() + p.toLocaleLowerCase().slice(1)).join(", ");

      if (method === "GET") {
         const additionalPermissions =
            additionalModules.length > 0 ? permissionList.filter((p) => additionalModules.includes(p.title)) : [];

         const hasMainReadAccess = mainPermissions.some((p) => p.can_read);
         const hasAdditionalReadAccess = additionalPermissions.some((p) => p.can_read);

         if (!hasMainReadAccess && !hasAdditionalReadAccess) {
            const errorMessage =
               additionalModules.length > 0
                  ? `${roleTitle} doesn't have permission to read in main modules (${name}) or any of the additional modules: ${additionalModules.join(", ")}`
                  : `${roleTitle} doesn't have permission to read in main modules: ${name}`;

            throw new ForbiddenException({
               status: false,
               message: errorMessage,
            });
         }
      } else {
         // For non-GET requests: check write access for ANY of the main modules
         const hasWriteAccess = mainPermissions.some((p) => p.can_write);

         if (!hasWriteAccess) {
            throw new ForbiddenException({
               status: false,
               message: `${roleTitle} doesn't have permission to write in any of the main modules: ${name}`,
            });
         }
      }
      request.can_read_all_data = mainPermissions.some((permission) => permission.can_read_all_data);

      return true;
   }
}
