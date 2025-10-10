export function serializeProject(projectObj) {
  return JSON.stringify(projectObj, null, 2);
}

export function downloadProjectJSON(projectObj, filename = "project.json") {
  const content = serializeProject(projectObj);
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
