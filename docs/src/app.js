import { wireLanguageHandlers, restoreLanguageFromSession } from "./applications/languageApp.js";
import { wireModelHandlers, restoreModelFromSession } from "./applications/modelApp.js";
import { wireGraphHandlers, restoreGraphFromSession } from "./applications/graphApp.js";
import { wireVariableCrudHandlers, restoreVariableCrudFromSession } from "./applications/variableCrudApp.js";
import { wireExampleHandlers } from "./applications/exampleApp.js";
import { logLogLevel } from "./utils/logger.js";
import { loadSession } from "./utils/persistence.js";
import { getLanguageEnv } from "./applications/languageApp.js";

/**
 * Formats error information for display to the user
 */
function formatErrorForDisplay(error, source) {
  let message = `An error occurred ${source}:\n\n`;
  
  if (error.message) {
    message += `Error: ${error.message}\n`;
  }
  
  if (error.stack) {
    message += `\nStack trace:\n${error.stack}`;
  }
  
  return message;
}

/**
 * Global error handler for unhandled JavaScript errors
 */
window.onerror = function(message, source, lineno, colno, error) {
  console.error("Unhandled error:", { message, source, lineno, colno, error });
  
  const errorMsg = error 
    ? formatErrorForDisplay(error, "in the application")
    : `An error occurred in the application:\n\n${message}\nat ${source}:${lineno}:${colno}`;
  
  alert(errorMsg);
  
  // Return true to prevent default error handling
  return true;
};

/**
 * Global error handler for error events (e.g., resource loading errors)
 */
window.addEventListener('error', function(event) {
  // Ignore errors that were already handled by window.onerror
  if (event.error) {
    return;
  }
  
  console.error("Error event:", event);
  
  if (event.target && event.target !== window) {
    // Resource loading error (e.g., image, script)
    const resource = event.target.src || event.target.href || "unknown resource";
    console.error(`Failed to load resource: ${resource}`);
    // Don't show alert for resource loading errors as they're usually non-critical
  }
}, true);

/**
 * Global handler for unhandled promise rejections
 */
window.addEventListener('unhandledrejection', function(event) {
  console.error("Unhandled promise rejection:", event.reason);
  
  const error = event.reason;
  let errorMsg;
  
  if (error instanceof Error) {
    errorMsg = formatErrorForDisplay(error, "in an asynchronous operation");
  } else {
    errorMsg = `An error occurred in an asynchronous operation:\n\n${JSON.stringify(error, null, 2)}`;
  }
  
  alert(errorMsg);
  
  // Prevent default handling
  event.preventDefault();
});

/**
 * Global resizer for e.g. use on small screens
 */
const params = new URLSearchParams(window.location.search);
if (params.has("large")) {
  document.documentElement.classList.add("large-ui");
}

wireLanguageHandlers();
wireModelHandlers();
wireGraphHandlers();
wireVariableCrudHandlers();
wireExampleHandlers();
logLogLevel();

// Restore any previously saved session so users don't lose work after a
// browser crash or accidental tab close.
const session = loadSession();
restoreLanguageFromSession(session);
if (getLanguageEnv()) {
  restoreModelFromSession(session);
  // After model load the modelLoaded event has already fired and the
  // dropdowns have been populated, so we can safely restore selections.
  restoreGraphFromSession(session);
  restoreVariableCrudFromSession(session);
}

