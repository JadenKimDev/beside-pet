import * as pulumi from "@pulumi/pulumi";

export type Ownership = "external" | "managed";

const config = new pulumi.Config();

function ownership(key: string): Ownership {
  const value = config.get(key) ?? "external";
  if (value !== "external" && value !== "managed") {
    throw new Error(`${key} must be external or managed`);
  }
  return value;
}

export const environment = pulumi.getStack();
export const awsWeb = {
  ownership: ownership("awsWebOwnership"),
  region: config.get("awsRegion") ?? "ap-northeast-2",
  ecrRegistry: config.get("awsEcrRegistry"),
  instanceId: config.get("awsInstanceId"),
  cloudFrontUrl: config.get("chatUrl"),
};

export const landingUrl = config.get("landingUrl");
