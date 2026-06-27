export type ConnectorKind = "JOB" | "CONTEST";

export type NormalizedItem = {
  id: string;
  title: string;
  url: string;
  raw: unknown;
  company?: string;
  location?: string | null;
  jobType?: string | null;
  timing?: string | null;
  postedAt?: Date | null;
  deadline?: Date | null;
  site?: string;
  startTime?: Date;
  durationSec?: number;
};

export interface Connector {
  sourceId: string;
  label: string;
  kind: ConnectorKind;
  pruneMissing?: boolean;
  fetchItems(): Promise<NormalizedItem[]>;
}
