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

// Shared by the Off button and every real protocol so both go through the
// exact same aria-pressed/label logic -- no hand-inlined sibling to drift.
export function protocolLabel(protocol) {
  return protocol.advisory ? `${protocol.label} (advisory)` : protocol.label;
}

function protocolChoiceButton(id, label, currentId, knownIds) {
  // Off is pressed whenever currentId doesn't resolve to a real protocol --
  // not just when it's falsy -- so a stale id (one deactivated/removed in
  // the Sheet since it was saved) still renders exactly one pressed button
  // rather than a group with nothing selected, even before app.js's own
  // boot-time reconciliation has run.
  const pressed = id ? currentId === id : !knownIds.has(currentId);
  return html`<button type="button" data-protocol-choice="${id}" aria-pressed="${pressed ? 'true' : 'false'}">${label}</button>`;
}

export function renderSettings(avoidances, protocols, settings) {
  const knownProtocolIds = new Set(protocols.map((p) => p.id));
  return html`
    <h1 tabindex="-1">Settings</h1>
    <section class="settings-section">
      <h2>Your allergies &amp; sensitivities</h2>
      <p>These badge matching recipes everywhere they appear. They never hide a recipe &mdash; every recipe still shows, badged.</p>
      <div>${avoidances.map((a) => avoidanceRow(a, settings.avoidanceIds))}</div>
    </section>
    <section class="settings-section">
      <h2>Diet protocol</h2>
      <p>Following one filters Browse down to compliant recipes, with a banner and a one-tap way to see everything anyway.</p>
      <div class="theme-row" role="group" aria-label="Diet protocol">
        ${protocolChoiceButton('', 'Off', settings.activeProtocolId, knownProtocolIds)}
        ${protocols.map((p) => protocolChoiceButton(p.id, protocolLabel(p), settings.activeProtocolId, knownProtocolIds))}
      </div>
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
