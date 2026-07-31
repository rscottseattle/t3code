import type { AccountUsageSnapshot } from "@t3tools/contracts";

import { usePrimaryEnvironment } from "../state/environments";
import { useEnvironmentQuery } from "../state/query";
import { serverEnvironment } from "../state/server";

const EMPTY_USAGE: AccountUsageSnapshot = {
  providers: [],
  updatedAt: "1970-01-01T00:00:00.000Z",
};

export function useAccountUsage(): {
  readonly data: AccountUsageSnapshot;
  readonly error: string | null;
  readonly isPending: boolean;
} {
  const primaryEnvironment = usePrimaryEnvironment();
  const environmentId = primaryEnvironment?.environmentId ?? null;
  const query = useEnvironmentQuery(
    environmentId === null ? null : serverEnvironment.accountUsage({ environmentId, input: {} }),
  );

  return {
    data: query.data ?? EMPTY_USAGE,
    error: query.error,
    isPending: query.isPending,
  };
}
