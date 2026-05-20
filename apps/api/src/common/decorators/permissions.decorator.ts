import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';
export interface PermissionRequirement {
  module: string;
  feature: string;
}
export const RequirePermission = (module: string, feature: string) =>
  SetMetadata(PERMISSIONS_KEY, { module, feature } satisfies PermissionRequirement);
