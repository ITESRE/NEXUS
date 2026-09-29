import { SetMetadata } from '@nestjs/common';

export const APPLICATION_ACCESS_KEY =
  'requiredApplication';

export const RequireApplication = (
  applicationKey: string,
) =>
  SetMetadata(
    APPLICATION_ACCESS_KEY,
    applicationKey,
  );