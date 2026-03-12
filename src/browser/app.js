import { wireModelHandlers, restoreModelFromSession } from "./applications/modelApp.js";
import { wireGraphHandlers, restoreGraphFromSession } from "./applications/graphApp.js";
import { wireVariableCrudHandlers, restoreVariableCrudFromSession } from "./applications/variableCrudApp.js";
import { wireExampleHandlers } from "./applications/exampleApp.js";
import { wireHelpHandlers } from "./applications/helpApp.js";
import { logLogLevel } from "../utils/logger.js";
import { loadSession, saveSession } from "../utils/persistence.js";

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

// Load the session before wiring handlers so that handler initialization
// (e.g. renderVariableDropdown inside wireVariableCrudHandlers) cannot
// overwrite persisted session values before we read them.
const session = loadSession();

wireModelHandlers();
wireGraphHandlers();
wireVariableCrudHandlers();
wireExampleHandlers();
wireHelpHandlers();
logLogLevel();

// Persist the open/closed state of every <details> element that has an id.
// The toggle event fires after the element's open attribute changes.
function saveDetailsState() {
  const detailsOpen = {};
  document.querySelectorAll('details[id]').forEach((el) => {
    detailsOpen[el.id] = el.open;
  });
  saveSession({ detailsOpen });
}

document.querySelectorAll('details[id]').forEach((el) => {
  el.addEventListener('toggle', saveDetailsState);
});

// Restore the open/closed state of <details> panels from a previous session.
function restoreDetailsFromSession(storedSession) {
  const detailsOpen = storedSession.detailsOpen;
  if (!detailsOpen || typeof detailsOpen !== 'object') return;
  Object.entries(detailsOpen).forEach(([id, isOpen]) => {
    const el = document.getElementById(id);
    if (el && el.tagName === 'DETAILS') {
      el.open = isOpen;
    }
  });
}

// Restore any previously saved session so users don't lose work after a
// browser crash or accidental tab close.
restoreDetailsFromSession(session);
restoreModelFromSession(session);
// After model load the modelLoaded event has already fired and the
// dropdowns have been populated, so we can safely restore selections.
restoreGraphFromSession(session);
restoreVariableCrudFromSession(session);

