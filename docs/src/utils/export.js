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

