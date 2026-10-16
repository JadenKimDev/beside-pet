import * as aws from "@pulumi/aws";
import { awsWeb, environment } from "./config";

// Existing EC2, CloudFront, RDS and IAM stay external until imported by ID.
// The optional managed mode provisions image repositories for a new stack.
// Image builds and container restarts remain deployment workflow responsibilities.
const provider =
  awsWeb.ownership === "managed"
    ? new aws.Provider("aws-web-provider", { region: awsWeb.region as aws.Region })
    : undefined;

function repository(name: string) {
  return new aws.ecr.Repository(
    name,
    {
      name: `${name}-${environment}`,
      imageScanningConfiguration: { scanOnPush: true },
      imageTagMutability: "MUTABLE",
      forceDelete: false,
      tags: { Project: "beside-pet", Environment: environment },
    },
    { provider, protect: true },
  );
}

const apiRepo = awsWeb.ownership === "managed" ? repository("beside-pet-api") : undefined;
const webRepo = awsWeb.ownership === "managed" ? repository("beside-pet-web") : undefined;

export const awsWebOutputs = {
  ownership: awsWeb.ownership,
  cloudFrontUrl: awsWeb.cloudFrontUrl,
  instanceId: awsWeb.instanceId,
  apiRepositoryUrl: apiRepo?.repositoryUrl ?? (awsWeb.ecrRegistry ? `${awsWeb.ecrRegistry}/beside-pet-api` : undefined),
  webRepositoryUrl: webRepo?.repositoryUrl ?? (awsWeb.ecrRegistry ? `${awsWeb.ecrRegistry}/beside-pet-web` : undefined),
};
