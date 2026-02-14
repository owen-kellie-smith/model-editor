import { wireLanguageHandlers } from "./applications/languageApp.js";
import { wireModelHandlers } from "./applications/modelApp.js";
import { wireGraphHandlers } from "./applications/graphApp.js";
import { wireVariableCrudHandlers } from "./applications/variableCrudApp.js";
import { wireClusterGraphHandlers } from "./applications/clusterGraphApp.js";
import { logLogLevel } from "./utils/logger.js";

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

wireLanguageHandlers();
wireModelHandlers();
wireGraphHandlers();
wireVariableCrudHandlers();
wireClusterGraphHandlers();
logLogLevel();

