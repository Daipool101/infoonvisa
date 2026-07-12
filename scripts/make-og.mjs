// Generates the branded default social share card (1200x630) at public/og-default.png.
// Rerun after brand changes: node scripts/make-og.mjs
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'node:fs';

const logo = readFileSync(new URL('../public/logo-icon.png', import.meta.url)).toString('base64');

// Brand: navy #202148, orange #F5642B, cream #FFF5D7.
const svg = `
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="630" fill="#202148"/>
  <circle cx="1050" cy="80" r="260" fill="#F5642B" opacity="0.16"/>
  <circle cx="120" cy="560" r="300" fill="#FFF5D7" opacity="0.07"/>
  <rect x="70" y="70" width="120" height="120" rx="28" fill="#ffffff"/>
  <image x="82" y="82" width="96" height="96" href="data:image/png;base64,${logo}"/>
  <text x="220" y="150" font-family="Arial, Helvetica, sans-serif" font-size="56" font-weight="800" fill="#ffffff">InfoOn<tspan fill="#F5642B">Visa</tspan></text>
  <text x="72" y="330" font-family="Arial, Helvetica, sans-serif" font-size="72" font-weight="800" fill="#ffffff">Know exactly what</text>
  <text x="72" y="415" font-family="Arial, Helvetica, sans-serif" font-size="72" font-weight="800" fill="#ffffff">visa you need<tspan fill="#F5642B">.</tspan></text>
  <text x="72" y="490" font-family="Arial, Helvetica, sans-serif" font-size="30" fill="#FFF5D7" opacity="0.85">Requirements · Documents · How to apply — verified from official sources</text>
  <rect x="72" y="530" width="360" height="56" rx="28" fill="#F5642B"/>
  <text x="252" y="567" font-family="Arial, Helvetica, sans-serif" font-size="26" font-weight="700" fill="#ffffff" text-anchor="middle">infoonvisa.com</text>
</svg>`;

const png = await sharp(Buffer.from(svg)).png().toBuffer();
writeFileSync(new URL('../public/og-default.png', import.meta.url), png);
console.log(`og-default.png written (${(png.length / 1024).toFixed(0)} KB)`);
