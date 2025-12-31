export interface S3Connection {
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
