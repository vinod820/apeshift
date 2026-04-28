import { accountsTransform } from "./accounts/index.js";
import { cleanupTransform } from "./cleanup/index.js";
import { containerTransform } from "./container/index.js";
import { contractsTransform } from "./contracts/index.js";
import { eventsTransform } from "./events/index.js";
import { exceptionsTransform } from "./exceptions/index.js";
import { importsTransform } from "./imports/index.js";
import { importsMultilineTransform } from "./imports-multiline/index.js";
import { manualReviewTransform } from "./manual-review/index.js";
import { networksTransform } from "./networks/index.js";
import { numericTransform } from "./numeric/index.js";
import { revertsTransform } from "./reverts/index.js";
import { testingTransform } from "./testing/index.js";
import { web3LegacyTransform } from "./web3-legacy/index.js";

export const transforms = [
  importsTransform,
  importsMultilineTransform,
  contractsTransform,
  networksTransform,
  accountsTransform,
  revertsTransform,
  exceptionsTransform,
  web3LegacyTransform,
  eventsTransform,
  numericTransform,
  containerTransform,
  testingTransform,
  cleanupTransform,
  manualReviewTransform,
];

export type { TransformModule, TransformResult } from "./types.js";
