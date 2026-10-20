import * as aws from "@pulumi/aws";
import type * as pulumi from "@pulumi/pulumi";
import { provider } from "./config";

const lifecyclePolicy = JSON.stringify({
  rules: [
    {
      rulePriority: 1,
      description: "태그 없는 이미지는 1일 뒤 지운다",
      selection: {
        tagStatus: "untagged",
        countType: "sinceImagePushed",
        countUnit: "days",
        countNumber: 1,
      },
      action: { type: "expire" },
    },
    {
      rulePriority: 2,
      description: "태그 있는 이미지는 최근 10개만 남긴다",
      selection: {
        tagStatus: "any",
        countType: "imageCountMoreThan",
        countNumber: 10,
      },
      action: { type: "expire" },
    },
  ],
});

function repository(name: string): aws.ecr.Repository {
  const repo = new aws.ecr.Repository(
    name,
    {
      name,
      imageTagMutability: "MUTABLE",
      imageScanningConfiguration: { scanOnPush: true },
    },
    { provider, protect: true },
  );
  new aws.ecr.LifecyclePolicy(`${name}-lifecycle`, { repository: repo.name, policy: lifecyclePolicy }, { provider });
  return repo;
}

export const apiRepository = repository("beside-pet-api");
export const webRepository = repository("beside-pet-web");

/** `<account>.dkr.ecr.<region>.amazonaws.com` — 저장소 URL 의 앞부분. */
export const ecrRegistry: pulumi.Output<string> = apiRepository.repositoryUrl.apply((url) => url.split("/")[0] ?? url);
