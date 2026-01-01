export interface S3Connection {
  id: string;
  name?: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  forcePathStyle?: boolean;
}

export interface ConnectionStatus {
  connected: boolean;
  error?: string;
  testedAt?: Date;
}
