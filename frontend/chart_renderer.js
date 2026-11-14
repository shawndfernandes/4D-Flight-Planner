export function drawVerticalProfile(predicted, safePath) {
  const canvas = document.getElementById("altitudeChart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  canvas.width = canvas.clientWidth || 800;
  canvas.height = canvas.clientHeight || 180;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const maxAlt = 45000;
  const padLeft = 38;
  const padRight = 16;
  const padTop = 14;
  const padBottom = 20;
  const w = canvas.width - padLeft - padRight;
  const h = canvas.height - padTop - padBottom;

  const altToY = (altFt) => padTop + h - (Math.max(0, Math.min(maxAlt, altFt)) / maxAlt) * h;
  const idxToX = (idx, total) => padLeft + (idx / Math.max(1, total - 1)) * w;

  // 1. Draw shaded Icing & Convective Storm bands along each waypoint column
  const colWidth = w / Math.max(1, predicted.length - 1);
  predicted.forEach((wp, idx) => {
    const xCenter = idxToX(idx, predicted.length);
    const xLeft = Math.max(padLeft, xCenter - colWidth / 2);
    const drawW = Math.min(padLeft + w - xLeft, colWidth);

    (wp.hazards || []).forEach(hz => {
      if (hz.type === "ICING") {
        const yTop = altToY(hz.top_ft || 24000);
        const yBase = altToY(hz.base_ft || 4000);
        ctx.fillStyle = "rgba(56, 189, 248, 0.26)";
        ctx.fillRect(xLeft, yTop, drawW, Math.max(4, yBase - yTop));
        ctx.strokeStyle = "rgba(56, 189, 248, 0.65)";
        ctx.lineWidth = 1;
        ctx.strokeRect(xLeft, yTop, drawW, Math.max(4, yBase - yTop));
      } else if (hz.type === "CONVECTIVE_STORM") {
        const yTop = altToY(hz.top_ft || 45000);
        const yBase = altToY(0);
        ctx.fillStyle = "rgba(239, 68, 68, 0.30)";
        ctx.fillRect(xLeft, yTop, drawW, yBase - yTop);
      }
    });
  });

  // 2. Draw Flight Level grid lines & time axis labels
  ctx.strokeStyle = "#1e293b";
  ctx.fillStyle = "#94a3b8";
  ctx.font = "10px sans-serif";
  for (let alt = 10000; alt <= 40000; alt += 10000) {
    const y = altToY(alt);
    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(padLeft + w, y);
    ctx.stroke();
    ctx.fillText(`FL${alt / 100}`, 4, y + 3);
  }

  predicted.forEach((wp, idx) => {
    if (idx % 3 === 0 || idx === predicted.length - 1) {
      const x = idxToX(idx, predicted.length);
      ctx.fillText(`+${wp.t_min}m`, x - 10, padTop + h + 13);
    }
  });

  // 3. Plot Amber (Current Projected Altitude) and Green (Safe 3D Altitude) lines
  const plotLine = (points, altKey, color) => {
    if (!points || points.length === 0) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    points.forEach((p, idx) => {
      const x = idxToX(idx, points.length);
      const y = altToY(p[altKey]);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  };

  plotLine(predicted, "alt_ft", "#f59e0b");
  plotLine(safePath, "safe_alt_ft", "#22c55e");
}
