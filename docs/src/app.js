import { wireLanguageHandlers } from "./applications/languageApp.js";
import { wireModelHandlers } from "./applications/modelApp.js";
import { wireGraphHandlers } from "./applications/graphApp.js";
import { logLogLevel } from "./utils/logger.js";


wireLanguageHandlers();
wireModelHandlers();
wireGraphHandlers();
logLogLevel();

