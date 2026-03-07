/**
 * Triggers a file download in the browser for the given string content.
 * Creates a temporary Blob URL, simulates a click on an anchor element, then revokes the URL.
 *
 * @param {string} content - The text content to save
 * @param {string} filename - The suggested filename for the download
 * @param {string} [mime="application/xml"] - The MIME type for the Blob
 * @returns {void}
 */
export function exportFile(content, filename, mime = "application/xml") {
  if (typeof content !== "string") {
	return;
  }

  if (!content || !content.trim()) {
    alert("Nothing to export");
    return;
  }

  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;

  document.body.appendChild(a);
  a.click();

  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

