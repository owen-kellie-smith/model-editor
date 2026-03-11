import { ui } from '../ui.js';
import { standardFunctionDescriptions } from '../../core/language.js';

/**
 * Populates the functions-help dialog table with one row per standard function,
 * then opens the dialog.  Safe to call multiple times (table is rebuilt each time).
 */
function openFunctionsHelp() {
  const tbody = ui.functionsHelpTable?.querySelector('tbody');
  if (!tbody) return;

  // Build table rows once (idempotent – clear first so re-opens are fresh)
  tbody.innerHTML = '';
  for (const { signature, description } of standardFunctionDescriptions) {
    const tr = document.createElement('tr');
    const tdSig = document.createElement('td');
    tdSig.textContent = signature;
    const tdDesc = document.createElement('td');
    tdDesc.textContent = description;
    tr.appendChild(tdSig);
    tr.appendChild(tdDesc);
    tbody.appendChild(tr);
  }

  ui.functionsHelpDialog?.showModal();
}

/**
 * Wires the "? Functions" button and the dialog close button.
 * Call once on application start-up.
 */
export function wireHelpHandlers() {
  ui.functionsHelpBtn?.addEventListener('click', () => openFunctionsHelp());

  ui.functionsHelpClose?.addEventListener('click', () => {
    ui.functionsHelpDialog?.close();
  });

  // Also close when the user clicks on the backdrop (outside the dialog).
  ui.functionsHelpDialog?.addEventListener('click', (e) => {
    // The dialog itself is the backdrop area; clicks on children bubble up.
    if (e.target === ui.functionsHelpDialog) {
      ui.functionsHelpDialog.close();
    }
  });
}
