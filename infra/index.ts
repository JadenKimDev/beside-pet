import { awsProfile, awsRegion, domain, instanceType, stack } from "./config";
import { apiRepository, ecrRegistry, webRepository } from "./ecr";

export { awsProfile, awsRegion, domain, ecrRegistry, instanceType, stack };
export const apiRepositoryUrl = apiRepository.repositoryUrl;
export const webRepositoryUrl = webRepository.repositoryUrl;
export { certificateValidationRecords, cloudFrontDomain } from "./edge";
export { eip, instanceId, publicDns } from "./host";
