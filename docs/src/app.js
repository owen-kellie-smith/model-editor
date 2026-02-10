import { wireLanguageHandlers } from "./applications/languageApp.js";
import { wireModelHandlers } from "./applications/modelApp.js";
import { logLogLevel } from "./utils/helpers.js";


wireLanguageHandlers();
wireModelHandlers();
logLogLevel();

