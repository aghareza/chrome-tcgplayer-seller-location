const checkbox = document.getElementById('enabled');
const status = document.getElementById('status');

chrome.storage.sync.get('enabled').then(data => {
  const enabled = data.enabled !== false;
  checkbox.checked = enabled;
  status.textContent = enabled ? 'On — badges appear on TCGPlayer product pages.' : 'Off — badges are hidden.';
});

checkbox.addEventListener('change', () => {
  const enabled = checkbox.checked;
  chrome.storage.sync.set({ enabled }).then(() => {
    status.textContent = enabled ? 'On — badges appear on TCGPlayer product pages.' : 'Off — badges are hidden.';
  });
});
