import { awsProfile, awsRegion, instanceType, stack } from "./config";
import { apiRepository, ecrRegistry, webRepository } from "./ecr";

export { awsProfile, awsRegion, ecrRegistry, instanceType, stack };
export const apiRepositoryUrl = apiRepository.repositoryUrl;
export const webRepositoryUrl = webRepository.repositoryUrl;
export { cloudFrontDomain } from "./edge";
export { eip, instanceId, publicDns } from "./host";
