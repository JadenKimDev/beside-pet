import { awsWebOutputs } from "./aws-web";
import { environment, landingUrl } from "./config";

export const stack = environment;
export const chat = awsWebOutputs;
export const landing = { url: landingUrl, ownership: "external" };
