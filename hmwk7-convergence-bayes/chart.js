"use strict";

// Small canvas chart helper: scales, axes, lines, bars and hover tooltip.

const $ = (id) => document.getElementById(id);
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function fmt(v, digits = 3) {
  if (!Number.isFinite(v)) return "–";
  if (v === 0) return "0";
  if (Number.isInteger(v) && Math.abs(v) < 1e5) return String(v);
  const a = Math.abs(v);
  if (a >= 1e4 || a < 1e-3) return v.toExponential(2);
  if (a >= 100) return v.toFixed(1);
  return v.toFixed(digits);
}

// ---------------------------------------------------------------- tooltip

const tip = $("tooltip");
function showTip(text, pageX, pageY) {
  tip.textContent = text;
  tip.style.display = "block";
  const w = tip.offsetWidth;
  const left = pageX + 14 + w > window.scrollX + document.documentElement.clientWidth ? pageX - w - 14 : pageX + 14;
  tip.style.left = left + "px";
  tip.style.top = pageY + 14 + "px";
}
function hideTip() { tip.style.display = "none"; }

// ---------------------------------------------------------------- plot helper

class Plot {
  constructor(container, height) {
    this.container = container;
    this.height = height;
    this.canvas = document.createElement("canvas");
    container.innerHTML = "";
    container.appendChild(this.canvas);
    this.hover = null;
    this.canvas.addEventListener("mousemove", (e) => {
      if (!this.hover) return;
      const r = this.canvas.getBoundingClientRect();
      const text = this.hover(e.clientX - r.left, e.clientY - r.top);
      if (text) showTip(text, e.pageX, e.pageY); else hideTip();
    });
    this.canvas.addEventListener("mouseleave", hideTip);
  }

  // x/y: {min, max, log}
  begin(x, y, pad = { l: 46, r: 22, t: 10, b: 30 }) {
    const dpr = window.devicePixelRatio || 1;
    const w = this.container.clientWidth || 300;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.canvas.style.height = this.height + "px";
    const ctx = this.canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, this.height);
    Object.assign(this, { ctx, w, h: this.height, x, y, pad });
    return this;
  }

  t(v, ax) { return ax.log ? Math.log10(v) : v; }
  X(v) {
    const { x, pad, w } = this;
    return pad.l + ((this.t(v, x) - this.t(x.min, x)) / (this.t(x.max, x) - this.t(x.min, x))) * (w - pad.l - pad.r);
  }
  Y(v) {
    const { y, pad, h } = this;
    return h - pad.b - ((this.t(v, y) - this.t(y.min, y)) / (this.t(y.max, y) - this.t(y.min, y))) * (h - pad.t - pad.b);
  }
  invX(px) {
    const { x, pad, w } = this;
    const t = this.t(x.min, x) + ((px - pad.l) / (w - pad.l - pad.r)) * (this.t(x.max, x) - this.t(x.min, x));
    return x.log ? Math.pow(10, t) : t;
  }

  axes(xTicks, yTicks, xFmt = String, yFmt = String, xLabel = "") {
    const { ctx, pad, w, h } = this;
    ctx.font = "10px 'JetBrains Mono', monospace";
    ctx.lineWidth = 1;
    ctx.strokeStyle = css("--border");
    ctx.fillStyle = css("--muted");
    ctx.textAlign = "right";
    for (const v of yTicks) {
      const py = Math.round(this.Y(v)) + 0.5;
      ctx.beginPath(); ctx.moveTo(pad.l, py); ctx.lineTo(w - pad.r, py); ctx.stroke();
      ctx.fillText(yFmt(v), pad.l - 5, py + 3);
    }
    ctx.textAlign = "center";
    for (const v of xTicks) ctx.fillText(xFmt(v), this.X(v), h - pad.b + 13);
    if (xLabel) ctx.fillText(xLabel, (pad.l + w - pad.r) / 2, h - 3);
  }

  clip(fn) {
    const { ctx, pad, w, h } = this;
    ctx.save();
    ctx.beginPath();
    ctx.rect(pad.l, pad.t, w - pad.l - pad.r, h - pad.t - pad.b);
    ctx.clip();
    fn(ctx);
    ctx.restore();
  }

  line(pts, color, width = 2, dash = null, alpha = 1) {
    this.clip((ctx) => {
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineJoin = "round";
      if (dash) ctx.setLineDash(dash);
      ctx.beginPath();
      pts.forEach(([a, b], i) => (i ? ctx.lineTo(this.X(a), this.Y(b)) : ctx.moveTo(this.X(a), this.Y(b))));
      ctx.stroke();
    });
  }

  band(xs, lo, hi, color, alpha = 0.16) {
    this.clip((ctx) => {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.beginPath();
      xs.forEach((x, i) => (i ? ctx.lineTo(this.X(x), this.Y(hi[i])) : ctx.moveTo(this.X(x), this.Y(hi[i]))));
      for (let i = xs.length - 1; i >= 0; i--) ctx.lineTo(this.X(xs[i]), this.Y(lo[i]));
      ctx.closePath();
      ctx.fill();
    });
  }

  dots(pts, color, r = 4) {
    this.clip((ctx) => {
      for (const [a, b] of pts) {
        ctx.fillStyle = css("--panel");
        ctx.beginPath(); ctx.arc(this.X(a), this.Y(b), r + 2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(this.X(a), this.Y(b), r, 0, Math.PI * 2); ctx.fill();
      }
    });
  }

  // bars: [{x0, x1, y}] anchored at y = 0, 2px gap between neighbours, rounded tops
  bars(list, color) {
    this.clip((ctx) => {
      ctx.fillStyle = color;
      for (const b of list) {
        if (b.y <= 0) continue;
        const x0 = this.X(b.x0) + 1, x1 = this.X(b.x1) - 1;
        const y0 = this.Y(0), y1 = this.Y(b.y);
        const wd = Math.max(1, x1 - x0), r = Math.min(4, wd / 2, (y0 - y1) / 2);
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x0, y1 + r);
        ctx.quadraticCurveTo(x0, y1, x0 + r, y1);
        ctx.lineTo(x0 + wd - r, y1);
        ctx.quadraticCurveTo(x0 + wd, y1, x0 + wd, y1 + r);
        ctx.lineTo(x0 + wd, y0);
        ctx.closePath();
        ctx.fill();
      }
    });
  }
}

function niceTicks(min, max, count = 5) {
  const span = max - min;
  if (!(span > 0)) return [min];
  const raw = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((s) => s >= raw);
  const out = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9 * span; v += step) out.push(+v.toFixed(10));
  return out;
}

function logTicks(min, max) {
  const out = [];
  for (let e = Math.floor(Math.log10(min)); e <= Math.ceil(Math.log10(max)); e++) {
    const v = Math.pow(10, e);
    if (v >= min * 0.999 && v <= max * 1.001) out.push(v);
  }
  return out;
}

const pow10Fmt = (v) => {
  const e = Math.round(Math.log10(v));
  return e >= 0 && e <= 4 ? String(Math.pow(10, e)) : "1e" + e;
};

function legend(el, items) {
  el.innerHTML = items
    .map(([label, color, kind]) => `<span style="--c:${color}" class="${kind || ""}">${label}</span>`)
    .join("");
}

