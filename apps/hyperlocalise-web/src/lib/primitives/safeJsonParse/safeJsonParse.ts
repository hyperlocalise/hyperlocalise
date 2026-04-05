import { fromThrowable } from "../result/results";

export const safeJsonParse = fromThrowable(JSON.parse);
