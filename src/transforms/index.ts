import { accountsTransform } from "./accounts/index.js";
import { cleanupTransform } from "./cleanup/index.js";
import { eventsTransform } from "./events/index.js";
import { exceptionsTransform } from "./exceptions/index.js";
import { importsMultilineTransform } from "./imports-multiline/index.js";
import { manualReviewTransform } from "./manual-review/index.js";
import { revertsTransform } from "./reverts/index.js";
import { web3LegacyTransform } from "./web3-legacy/index.js";

export const transforms = [
  importsMultilineTransform,
  accountsTransform,
  revertsTransform,
  exceptionsTransform,
  web3LegacyTransform,
  eventsTransform,
  cleanupTransform,
  manualReviewTransform,
];

export type { TransformModule, TransformResult } from "./types.js";
