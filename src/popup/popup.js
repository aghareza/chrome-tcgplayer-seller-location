const TCG = window.TCG_SELLER_LOC;
const checkbox = document.getElementById('enabled');
const status = document.getElementById('status');
const statesInput = document.getElementById('states');
const statesStatus = document.getElementById('states-status');

chrome.storage.sync.get(['enabled', 'highlightStates']).then(data => {
  const enabled = data.enabled !== false;
  checkbox.checked = enabled;
  status.textContent = enabled ? 'On — badges appear on TCGPlayer product pages.' : 'Off — badges are hidden.';

  const codes = Array.isArray(data.highlightStates) ? data.highlightStates : TCG.DEFAULT_HIGHLIGHT_STATES;
  statesInput.value = codes.join(', ');
  showStates(codes, []);
});

checkbox.addEventListener('change', () => {
  const enabled = checkbox.checked;
  chrome.storage.sync.set({ enabled }).then(() => {
    status.textContent = enabled ? 'On — badges appear on TCGPlayer product pages.' : 'Off — badges are hidden.';
  });
});

// Preview while typing; save when the field is committed (Enter or leaving the field).
statesInput.addEventListener('input', () => {
  const { codes, invalid } = TCG.parseStateList(statesInput.value);
  showStates(codes, invalid);
});

statesInput.addEventListener('keydown', event => {
  if (event.key === 'Enter') statesInput.blur();
});

statesInput.addEventListener('change', () => {
  const { codes, invalid } = TCG.parseStateList(statesInput.value);
  if (invalid.length) {
    showStates(codes, invalid);
    return;
  }
  chrome.storage.sync.set({ highlightStates: codes }).then(() => {
    statesInput.value = codes.join(', ');
    showStates(codes, [], 'Saved. ');
  });
});

function showStates(codes, invalid, prefix = '') {
  const hasError = invalid.length > 0;
  statesInput.setAttribute('aria-invalid', String(hasError));
  statesStatus.classList.toggle('states__status--error', hasError);
  if (hasError) {
    statesStatus.textContent = `Not a US state: ${invalid.join(', ')}`;
  } else if (codes.length) {
    statesStatus.textContent = `${prefix}Highlighting ${codes.map(code => TCG.US_STATES[code]).join(', ')}.`;
  } else {
    statesStatus.textContent = `${prefix}No states highlighted.`;
  }
}
