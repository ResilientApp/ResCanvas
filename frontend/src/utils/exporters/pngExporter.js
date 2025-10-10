export async function exportToPNG({ canvas, filename = "project.png" }) {
  if (!canvas) throw new Error("No canvas element provided");
  const dataUrl = canvas.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
