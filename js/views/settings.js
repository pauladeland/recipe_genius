import { html } from '../ui/html.js';

const SEVERITY_LABEL = { allergy: 'Allergy', sensitivity: 'Sensitivity', protocol: 'Other' };

function avoidanceRow(avoidance, checkedIds) {
  const checked = checkedIds.includes(avoidance.id);
  return html`
    <label class="avoidance-row">
      <input type="checkbox" name="avoidance" value="${avoidance.id}" ${checked ? html`checked` : ''}>
      ${avoidance.label}
      <span style="margin-left:auto; font-size:11px; color:var(--ink-soft);">${SEVERITY_LABEL[avoidance.severity] || avoidance.severity}</span>
    </label>
  `;
}

function themeButton(value, label, current) {
  const pressed = current === value;
  return html`<button type="button" data-theme-choice="${value}" aria-pressed="${pressed ? 'true' : 'false'}">${label}</button>`;
}

export function renderSettings(avoidances, settings) {
  return html`
    <h1 tabindex="-1">Settings</h1>
    <section class="settings-section">
      <h2>Your allergies &amp; sensitivities</h2>
      <p>These badge matching recipes everywhere they appear. They never hide a recipe &mdash; every recipe still shows, badged.</p>
      <div>${avoidances.map((a) => avoidanceRow(a, settings.avoidanceIds))}</div>
    </section>
    <section class="settings-section">
      <h2>Theme</h2>
      <div class="theme-row" role="group" aria-label="Theme">
        ${themeButton('system', 'System', settings.theme)}
        ${themeButton('light', 'Light', settings.theme)}
        ${themeButton('dark', 'Dark', settings.theme)}
      </div>
    </section>
  `;
}
